/**
 * Session boundary resolver for Pi workflow state.
 *
 * Provides `resolvePiSessionForRead`, `resolvePiSessionForWrite`,
 * `detectLatestSession`, and `writeSessionActivityMarker`.
 *
 * Resolution order: CLI flag → payload sessionId → env `PI_SESSION_ID`.
 * Blank flags fail closed (throw `blank_flag`). Write without any source
 * fails closed (throw `missing_for_write`). Read without any source fails
 * closed (throw `no_session`). There is NO global fallback — session-scoped
 * isolation is mandatory.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
	piSessionRoot,
	sessionActivityPath,
	sessionIdFromDirName,
} from "#workflows/harness/shared/session/session-layout";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type SessionResolutionErrorCode = "blank_flag" | "no_session" | "ambiguous" | "missing_for_write";

export class SessionResolutionError extends Error {
	readonly code: SessionResolutionErrorCode;
	constructor(message: string, code: SessionResolutionErrorCode) {
		super(message);
		this.name = "SessionResolutionError";
		this.code = code;
	}
}

// ---------------------------------------------------------------------------
// Resolution sources
// ---------------------------------------------------------------------------

export interface SessionResolutionSources {
	/** Explicit CLI flag value (`--session <id>`). */
	flagValue?: string;
	/** Session id from the payload (e.g., `ctx.sessionManager.getSessionId()`). */
	payloadSessionId?: string;
	/** Session id from the environment variable `PI_SESSION_ID`. */
	envSessionId?: string;
}

export interface ResolvedSession {
	sessionId: string;
	sessionRoot: string;
	source: "flag" | "payload" | "env" | "latest";
}

// ---------------------------------------------------------------------------
// Resolution logic
// ---------------------------------------------------------------------------

const BLANK_RE = /^\s*$/;

/**
 * Resolve a session id from multiple sources using strict priority:
 *   flag → payload → env.
 *
 * A blank flag (whitespace-only) throws `SessionResolutionError` with code
 * `blank_flag`. A blank payload or env value is silently skipped.
 */
export function resolveSessionIdFromSources(sources: SessionResolutionSources): string | undefined {
	// 1. Flag — must be non-blank, fail closed on blank
	if (sources.flagValue !== undefined) {
		if (BLANK_RE.test(sources.flagValue)) {
			throw new SessionResolutionError("session id from --session flag is blank", "blank_flag");
		}
		return sources.flagValue;
	}

	// 2. Payload — skip blank
	if (sources.payloadSessionId !== undefined && !BLANK_RE.test(sources.payloadSessionId)) {
		return sources.payloadSessionId;
	}

	// 3. Env — skip blank
	if (sources.envSessionId !== undefined && !BLANK_RE.test(sources.envSessionId)) {
		return sources.envSessionId;
	}

	return undefined;
}

/**
 * Resolve a session for **read** operations.
 *
 * Tries explicit sources (flag → payload → env), then falls back to
 * `detectLatestSession`. If no session can be resolved by any means,
 * throws `SessionResolutionError` with code `no_session`.
 * There is NO global fallback — session isolation is mandatory.
 */
export async function resolvePiSessionForRead(
	cwd: string,
	sources: SessionResolutionSources,
): Promise<ResolvedSession> {
	const explicit = resolveSessionIdFromSources(sources);
	if (explicit) {
		return { sessionId: explicit, sessionRoot: piSessionRoot(cwd, explicit), source: flagOrPayloadOrEnv(sources) };
	}
	const latest = await detectLatestSession(cwd);
	if (latest) return { ...latest, source: "latest" };
	throw new SessionResolutionError(
		"No session ID provided. Set PI_SESSION_ID env var or pass --session.",
		"no_session",
	);
}

/**
 * Resolve a session for **write** operations.
 *
 * Requires an explicit session id (flag → payload → env). Throws
 * `SessionResolutionError` with code `missing_for_write` when none is
 * available — write operations must never silently fall back to global.
 * Does NOT fall back to `detectLatestSession` for writes.
 */
export async function resolvePiSessionForWrite(
	cwd: string,
	sources: SessionResolutionSources,
): Promise<ResolvedSession> {
	const explicit = resolveSessionIdFromSources(sources);
	if (explicit) {
		return { sessionId: explicit, sessionRoot: piSessionRoot(cwd, explicit), source: flagOrPayloadOrEnv(sources) };
	}
	throw new SessionResolutionError(
		"No session ID provided. Set PI_SESSION_ID env var or pass --session.",
		"missing_for_write",
	);
}

// ---------------------------------------------------------------------------
// Latest-session detection
// ---------------------------------------------------------------------------

/** Maximum age difference (ms) between two activity markers to break a tie. */
export const LATEST_SESSION_TIE_WINDOW_MS = 1000;

export interface DetectedSession {
	sessionId: string;
	sessionRoot: string;
}

/**
 * Scan `.pi/` for session directories and pick the latest one based
 * on the `.session-activity.json` modification time. Directories without
 * an activity marker are ignored.
 *
 * Returns `undefined` when no session directories are found.
 * Throws `ambiguous` when two or more sessions have markers within
 * `LATEST_SESSION_TIE_WINDOW_MS` of each other.
 */
export async function detectLatestSession(cwd: string): Promise<DetectedSession | undefined> {
	const piDir = join(cwd, ".pi");
	let entries: string[];
	try {
		entries = await readdir(piDir);
	} catch {
		return undefined;
	}

	const sessionDirs = entries.filter((name) => !name.startsWith("."));
	if (sessionDirs.length === 0) return undefined;

	// Check each session dir for an activity marker
	const candidates: Array<{ sessionId: string; sessionRoot: string; mtimeMs: number }> = [];
	for (const dirName of sessionDirs) {
		const id = sessionIdFromDirName(dirName);
		if (!id) continue;
		const root = piSessionRoot(cwd, id);
		const markerPath = sessionActivityPath(cwd, id);
		try {
			const stat = await import("node:fs/promises").then((m) => m.stat(markerPath));
			candidates.push({ sessionId: id, sessionRoot: root, mtimeMs: stat.mtimeMs });
		} catch {}
	}

	if (candidates.length === 0) return undefined;

	// Sort by most recent mtimeMs
	candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

	if (candidates.length === 1) {
		return { sessionId: candidates[0].sessionId, sessionRoot: candidates[0].sessionRoot };
	}

	// Check for ambiguity: two candidates within the tie window
	if (candidates[0].mtimeMs - candidates[1].mtimeMs < LATEST_SESSION_TIE_WINDOW_MS) {
		throw new SessionResolutionError(
			`ambiguous: multiple recent sessions detected (${candidates[0].sessionId}, ${candidates[1].sessionId}); specify --session explicitly`,
			"ambiguous",
		);
	}

	return { sessionId: candidates[0].sessionId, sessionRoot: candidates[0].sessionRoot };
}

// ---------------------------------------------------------------------------
// Activity marker
// ---------------------------------------------------------------------------

export interface ActivityMarkerContent {
	session_id: string;
	created_at: string;
	updated_at: string;
}

/**
 * Write or update a session activity marker file. Called by the write path
 * to record that a session is alive and to provide a timestamp for
 * `detectLatestSession`.
 */
export async function writeSessionActivityMarker(
	cwd: string,
	id: string,
	options: { writer?: (path: string, content: string) => Promise<void>; path?: string } = {},
): Promise<void> {
	const markerPath = options.path ?? sessionActivityPath(cwd, id);
	const now = new Date().toISOString();
	let existing: ActivityMarkerContent | undefined;
	try {
		const content = await import("node:fs/promises").then((m) => m.readFile(markerPath, "utf8"));
		existing = JSON.parse(content) as ActivityMarkerContent;
	} catch {
		// No existing marker
	}
	const content: ActivityMarkerContent = {
		session_id: id,
		created_at: existing?.created_at ?? now,
		updated_at: now,
	};
	const writer = options.writer ?? defaultWriter;
	await writer(markerPath, JSON.stringify(content, null, 2));
}

async function defaultWriter(path: string, content: string): Promise<void> {
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flagOrPayloadOrEnv(sources: SessionResolutionSources): "flag" | "payload" | "env" {
	if (sources.flagValue !== undefined) return "flag";
	if (sources.payloadSessionId !== undefined && !BLANK_RE.test(sources.payloadSessionId)) return "payload";
	return "env";
}
