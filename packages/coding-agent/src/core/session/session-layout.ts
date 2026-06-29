import { join } from "node:path";

export function encodeSessionSegment(id: string): string {
	return encodeURIComponent(id).replaceAll(".", "%2E");
}

export function assertNonEmptySessionId(value: unknown, source: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`No session ID provided. Set PI_SESSION_ID env var or pass --session. (source: ${source})`);
	}
}

export function sessionDirName(id: string): string {
	return encodeSessionSegment(id);
}

export function piSessionRoot(cwd: string, sessionId: string): string {
	assertNonEmptySessionId(sessionId, "piSessionRoot");
	return join(cwd, ".pi", sessionDirName(sessionId.trim()));
}

export function sessionStateDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "state");
}
