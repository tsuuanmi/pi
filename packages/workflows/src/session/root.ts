/**
 * Shared `.pi` session-root primitives.
 *
 * This module deliberately contains no workflow state or Pi runtime imports.
 * Pi-native state and workflow-owned artifacts compose these paths so the
 * session identity encoding and root layout have one canonical implementation.
 */

import { join } from "node:path";

/**
 * Encode a value for use as a filesystem path segment.
 *
 * Uses `encodeURIComponent` with dots additionally escaped to `%2E` so that
 * the encoded form never contains `..` (path traversal) or `/` (separator).
 */
export function encodePathSegment(value: string): string {
	return encodeURIComponent(value).replaceAll(".", "%2E");
}

/** Decode a filesystem path segment back to its original value. */
export function decodePathSegment(segment: string): string {
	return decodeURIComponent(segment);
}

/** Assert that a session id is non-empty and usable. */
export function assertSessionId(value: unknown): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("No session ID provided. Set PI_SESSION_ID env var or pass --session.");
	}
}

/** Return the directory name (not full path) for a session id. */
export function sessionDirName(id: string): string {
	return encodePathSegment(id);
}

/** Extract the session id from a session directory name. */
export function sessionIdFromDirName(name: string): string | undefined {
	try {
		return decodePathSegment(name);
	} catch {
		return undefined;
	}
}

/** Global `.pi/` root. */
export function piGlobalRoot(cwd: string): string {
	return join(cwd, ".pi");
}

/** Full path to a session root: `cwd/.pi/{encoded}/`. */
export function piSessionRoot(cwd: string, sessionId: string): string {
	assertSessionId(sessionId);
	return join(piGlobalRoot(cwd), sessionDirName(sessionId.trim()));
}

/** Path to the shared state directory for a session. */
export function sessionStateDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "state");
}
