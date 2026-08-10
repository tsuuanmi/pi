import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	decodePathSegment,
	encodePathSegment,
	piGlobalRoot,
	piSessionRoot,
	requireSessionId,
	sessionDirName,
	sessionIdFromDirName,
} from "#pi/session/root";

describe("session root", () => {
	it("round-trips encoded path segments", () => {
		const id = "hello world/test.session";
		const encoded = encodePathSegment(id);

		expect(encoded).not.toContain(".");
		expect(encoded).not.toContain("/");
		expect(decodePathSegment(encoded)).toBe(id);
	});

	it("requires a non-empty session id", () => {
		expect(() => requireSessionId("abc123")).not.toThrow();
		expect(() => requireSessionId("")).toThrow(/No session ID/);
		expect(() => requireSessionId("  ")).toThrow(/No session ID/);
		expect(() => requireSessionId(undefined)).toThrow(/No session ID/);
	});

	it("round-trips session directory names", () => {
		const id = "test.session.id";
		const directory = sessionDirName(id);

		expect(directory).toBe("test%2Esession%2Eid");
		expect(sessionIdFromDirName(directory)).toBe(id);
		expect(sessionIdFromDirName("%E0%A4%A")).toBeUndefined();
	});

	it("builds the global and session roots", () => {
		expect(piGlobalRoot("/project")).toBe(join("/project", ".pi"));
		expect(piSessionRoot("/project", "sess-1")).toBe(join("/project", ".pi", "sess-1"));
	});
});
