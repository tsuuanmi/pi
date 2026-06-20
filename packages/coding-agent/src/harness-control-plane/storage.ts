import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { withFileMutationQueue } from "../core/tools/file-mutation-queue.ts";
import { writeJsonAtomic } from "../workflows/state-writer.ts";
import type {
	RuntimeLogDiagnostic,
	RuntimeLogReadResult,
	RuntimeReceipt,
	SessionState,
	WorkflowRuntimeEvent,
} from "./types.ts";

const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface SessionPaths {
	dir: string;
	state: string;
	lease: string;
	events: string;
	receipts: string;
	receiptsDir: string;
	piSessionDir: string;
	controlSock: string;
}

export function canonicalWorkspacePath(workspace: string): string {
	return resolve(workspace);
}

export function assertSafeSessionId(id: string): void {
	if (!SESSION_ID_RE.test(id)) throw new Error(`unsafe_session_id:${id}`);
}

export function generateSessionId(prefix = "h"): string {
	const ts = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
	return `${prefix}-${ts}-${randomBytes(4).toString("hex")}`;
}

function encodeSessionId(sessionId: string): string {
	assertSafeSessionId(sessionId);
	return encodeURIComponent(sessionId).replaceAll(".", "%2E");
}

export function resolveHarnessRoot(opts?: { root?: string; cwd?: string; env?: NodeJS.ProcessEnv }): string {
	const env = opts?.env ?? process.env;
	if (opts?.root) return resolve(opts.root);
	const fromEnv = env.PI_HARNESS_STATE_ROOT;
	if (fromEnv?.trim()) return resolve(fromEnv.trim());
	return join(opts?.cwd ?? process.cwd(), ".pi", "state", "harness");
}

export function sessionPaths(root: string, sessionId: string): SessionPaths {
	const dir = join(root, "sessions", encodeSessionId(sessionId));
	return {
		dir,
		state: join(dir, "state.json"),
		lease: join(dir, "lease.json"),
		events: join(dir, "events.jsonl"),
		receipts: join(dir, "receipts.jsonl"),
		receiptsDir: join(dir, "receipts"),
		piSessionDir: join(dir, "pi-session"),
		controlSock: controlSocketPath(root, sessionId),
	};
}

export function controlSocketPath(root: string, sessionId: string): string {
	const digest = createHash("sha256")
		.update(`${resolve(root)}\0${sessionId}`)
		.digest("hex");
	return join(tempHarnessRoot(), `${digest.slice(0, 32)}.sock`);
}

async function readJson<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return null;
		throw error;
	}
}

export async function readSessionState(root: string, sessionId: string): Promise<SessionState | null> {
	return readJson<SessionState>(sessionPaths(root, sessionId).state);
}

export async function writeSessionState(root: string, state: SessionState): Promise<void> {
	await writeJsonAtomic(
		sessionPaths(root, state.sessionId).state,
		{ ...state },
		{ cwd: projectCwdForHarnessRoot(root) },
	);
}

function projectCwdForHarnessRoot(root: string): string | undefined {
	const marker = "/.pi/state/harness";
	const normalized = root.replaceAll("\\", "/");
	return normalized.endsWith(marker) ? root.slice(0, -marker.length) : undefined;
}

async function appendJsonl(path: string, row: unknown): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(row)}\n`, "utf8");
	});
}

export async function appendEvent(root: string, sessionId: string, row: Record<string, unknown>): Promise<void> {
	await appendJsonl(sessionPaths(root, sessionId).events, row);
}

export async function appendRuntimeEvent(root: string, sessionId: string, event: WorkflowRuntimeEvent): Promise<void> {
	await appendJsonl(sessionPaths(root, sessionId).events, event);
}

export async function appendRuntimeReceipt(root: string, sessionId: string, receipt: RuntimeReceipt): Promise<void> {
	await appendJsonl(sessionPaths(root, sessionId).receipts, receipt);
}

function readJsonlShape<T extends object>(path: string, raw: string, afterCursor: number): RuntimeLogReadResult<T> {
	const rows: T[] = [];
	const diagnostics: RuntimeLogDiagnostic[] = [];
	let maxCursor = 0;
	const lines = raw.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch (error) {
			diagnostics.push({
				path,
				line: index + 1,
				code: "invalid-json",
				message: error instanceof Error ? error.message : String(error),
			});
			continue;
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			diagnostics.push({ path, line: index + 1, code: "invalid-shape", message: "row must be a JSON object" });
			continue;
		}
		const row = parsed as Record<string, unknown>;
		const cursor = typeof row.cursor === "number" ? row.cursor : 0;
		maxCursor = Math.max(maxCursor, cursor);
		if (cursor > afterCursor) rows.push(row as T);
	}
	return { rows, diagnostics, maxCursor };
}

export async function readRuntimeEvents(
	root: string,
	sessionId: string,
	afterCursor = 0,
): Promise<RuntimeLogReadResult<WorkflowRuntimeEvent>> {
	const path = sessionPaths(root, sessionId).events;
	try {
		return readJsonlShape<WorkflowRuntimeEvent>(path, await readFile(path, "utf8"), afterCursor);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return { rows: [], diagnostics: [], maxCursor: 0 };
		throw error;
	}
}

export async function readEvents(root: string, sessionId: string, afterCursor = 0): Promise<Record<string, unknown>[]> {
	return (await readRuntimeEvents(root, sessionId, afterCursor)).rows.map((row) => ({ ...row }));
}

export async function readRuntimeReceipts(
	root: string,
	sessionId: string,
): Promise<RuntimeLogReadResult<RuntimeReceipt>> {
	const path = sessionPaths(root, sessionId).receipts;
	try {
		return readJsonlShape<RuntimeReceipt>(path, await readFile(path, "utf8"), -1);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return { rows: [], diagnostics: [], maxCursor: 0 };
		throw error;
	}
}

export async function removeSession(root: string, sessionId: string): Promise<void> {
	await rm(sessionPaths(root, sessionId).dir, { recursive: true, force: true });
}

export function defaultRepoName(workspace: string): string | null {
	return existsSync(join(workspace, ".git")) ? basename(workspace) : null;
}

export function tempHarnessRoot(): string {
	return join(tmpdir(), `pi-harness-${process.getuid?.() ?? "u"}`);
}
