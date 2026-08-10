import { join } from "node:path";

/** Encode a value for use as a filesystem path segment. */
export function encodePathSegment(value: string): string {
	return encodeURIComponent(value).replaceAll(".", "%2E");
}

/** Decode a filesystem path segment. */
export function decodePathSegment(segment: string): string {
	return decodeURIComponent(segment);
}

/** Require a non-empty session id. */
export function requireSessionId(value: unknown): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("No session ID provided. CLI commands require --session; runtime payloads require sessionId.");
	}
}

/** Return the directory name for a session id. */
export function sessionDirName(id: string): string {
	return encodePathSegment(id);
}

/** Extract a session id from a directory name. */
export function sessionIdFromDirName(name: string): string | undefined {
	try {
		return decodePathSegment(name);
	} catch {
		return undefined;
	}
}

/** Return the global `.pi` root. */
export function piGlobalRoot(cwd: string): string {
	return join(cwd, ".pi");
}

/** Return the session root: `cwd/.pi/{encoded}/`. */
export function piSessionRoot(cwd: string, sessionId: string): string {
	requireSessionId(sessionId);
	return join(piGlobalRoot(cwd), sessionDirName(sessionId.trim()));
}

/** Return the shared session state directory. */
export function sessionStateDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "state");
}
