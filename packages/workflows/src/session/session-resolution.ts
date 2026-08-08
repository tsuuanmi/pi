/**
 * Resolve explicit session identity for workflow operations.
 *
 * Resolution order is flag, payload, then `PI_SESSION_ID`. Blank flags fail
 * closed. Reads and writes never discover or select another session.
 */

import { piSessionRoot } from "#workflows/session/root";

export type SessionResolutionErrorCode = "blank_flag" | "no_session" | "missing_for_write";

export class SessionResolutionError extends Error {
	readonly code: SessionResolutionErrorCode;

	constructor(message: string, code: SessionResolutionErrorCode) {
		super(message);
		this.name = "SessionResolutionError";
		this.code = code;
	}
}

export interface SessionResolutionSources {
	/** Explicit CLI flag value (`--session <id>`). */
	flagValue?: string;
	/** Session id from the payload (for example, `ctx.sessionManager.getSessionId()`). */
	payloadSessionId?: string;
	/** Session id from the `PI_SESSION_ID` environment variable. */
	envSessionId?: string;
}

export interface ResolvedSession {
	sessionId: string;
	sessionRoot: string;
	source: "flag" | "payload" | "env";
}

const BLANK_RE = /^\s*$/;

/** Resolve an explicit session id in flag, payload, then environment order. */
export function resolveSessionIdFromSources(sources: SessionResolutionSources): string | undefined {
	if (sources.flagValue !== undefined) {
		if (BLANK_RE.test(sources.flagValue)) {
			throw new SessionResolutionError("session id from --session flag is blank", "blank_flag");
		}
		return sources.flagValue;
	}

	if (sources.payloadSessionId !== undefined && !BLANK_RE.test(sources.payloadSessionId)) {
		return sources.payloadSessionId;
	}

	if (sources.envSessionId !== undefined && !BLANK_RE.test(sources.envSessionId)) {
		return sources.envSessionId;
	}

	return undefined;
}

/** Resolve the session required for a read operation. */
export function resolvePiSessionForRead(cwd: string, sources: SessionResolutionSources): ResolvedSession {
	return resolveSession(cwd, sources, "no_session");
}

/** Resolve the session required for a write operation. */
export function resolvePiSessionForWrite(cwd: string, sources: SessionResolutionSources): ResolvedSession {
	return resolveSession(cwd, sources, "missing_for_write");
}

function resolveSession(
	cwd: string,
	sources: SessionResolutionSources,
	missingCode: "no_session" | "missing_for_write",
): ResolvedSession {
	const sessionId = resolveSessionIdFromSources(sources);
	if (!sessionId) {
		throw new SessionResolutionError(
			"No session ID provided. Set PI_SESSION_ID env var or pass --session.",
			missingCode,
		);
	}

	return {
		sessionId,
		sessionRoot: piSessionRoot(cwd, sessionId),
		source: sourceFor(sources),
	};
}

function sourceFor(sources: SessionResolutionSources): ResolvedSession["source"] {
	if (sources.flagValue !== undefined) return "flag";
	if (sources.payloadSessionId !== undefined && !BLANK_RE.test(sources.payloadSessionId)) return "payload";
	return "env";
}
