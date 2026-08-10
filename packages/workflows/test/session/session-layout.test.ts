import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertSafePathComponent,
	auditLogPath,
	transactionJournalPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "@tsuuanmi/pi-workflows";
import {
	assertSessionId,
	decodePathSegment,
	encodePathSegment,
	piGlobalRoot,
	piSessionRoot,
	sessionDirName,
	sessionIdFromDirName,
} from "@tsuuanmi/pi-workflows/session/root";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("session-layout", () => {
	describe("encodePathSegment / decodePathSegment", () => {
		it("round-trips simple ASCII ids", () => {
			const id = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
			expect(decodePathSegment(encodePathSegment(id))).toBe(id);
		});

		it("escapes dots to prevent path traversal", () => {
			const encoded = encodePathSegment("a.b.c");
			expect(encoded).not.toContain(".");
			expect(decodePathSegment(encoded)).toBe("a.b.c");
		});

		it("escapes special characters", () => {
			const id = "hello world/test";
			const encoded = encodePathSegment(id);
			expect(encoded).not.toContain("/");
			expect(decodePathSegment(encoded)).toBe(id);
		});
	});

	describe("assertSessionId", () => {
		it("accepts valid session ids", () => {
			expect(() => assertSessionId("abc123")).not.toThrow();
		});

		it("throws on blank session ids", () => {
			expect(() => assertSessionId("")).toThrow(/No session ID/);
			expect(() => assertSessionId("  ")).toThrow(/No session ID/);
			expect(() => assertSessionId(undefined)).toThrow(/No session ID/);
		});
	});

	describe("assertSafePathComponent", () => {
		it("accepts valid components", () => {
			expect(() => assertSafePathComponent("ralplan", "skill")).not.toThrow();
			expect(() => assertSafePathComponent("run-abc123", "runId")).not.toThrow();
		});

		it("rejects path traversal", () => {
			expect(() => assertSafePathComponent("..", "label")).toThrow();
			expect(() => assertSafePathComponent("a/b", "label")).toThrow();
		});

		it("rejects empty strings", () => {
			expect(() => assertSafePathComponent("", "label")).toThrow();
		});
	});

	describe("sessionDirName / sessionIdFromDirName", () => {
		it("produces bare encoded directory names", () => {
			expect(sessionDirName("abc")).toBe("abc");
		});

		it("round-trips through encodePathSegment", () => {
			const id = "test.session.id";
			const dirName = sessionDirName(id);
			expect(dirName).toBe("test%2Esession%2Eid");
			expect(sessionIdFromDirName(dirName)).toBe(id);
		});

		it("returns undefined for invalid encoded directory names", () => {
			expect(sessionIdFromDirName("%E0%A4%A")).toBeUndefined();
		});
	});

	describe("piGlobalRoot", () => {
		it("returns global .pi path", () => {
			expect(piGlobalRoot("/project")).toBe(join("/project", ".pi"));
		});
	});

	describe("piSessionRoot", () => {
		it("returns session-scoped root directory", () => {
			expect(piSessionRoot("/project", "sess-1")).toBe(join("/project", ".pi", "sess-1"));
		});
	});

	describe("session-scoped path builders", () => {
		let cwd: string;

		beforeEach(() => {
			cwd = join(tmpdir(), `pi-session-layout-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		});

		afterEach(async () => {
			await rm(cwd, { recursive: true, force: true });
		});

		it("workflowStatePath resolves to session dir", () => {
			expect(workflowStatePath(cwd, "ralplan", "sess-1")).toBe(
				join(cwd, ".pi", "sess-1", "workflows", "ralplan", "state.json"),
			);
		});

		it("workflowActiveStatePath resolves to session dir", () => {
			expect(workflowActiveStatePath(cwd, "sess-1")).toBe(
				join(cwd, ".pi", "sess-1", "workflows", "active-state.json"),
			);
		});

		it("auditLogPath resolves to session state dir", () => {
			expect(auditLogPath(cwd, "sess-1")).toBe(join(cwd, ".pi", "sess-1", "state", "audit.jsonl"));
		});

		it("transactionJournalPath resolves to session state dir", () => {
			expect(transactionJournalPath(cwd, "sess-1", "mut-1")).toBe(
				join(cwd, ".pi", "sess-1", "state", "transactions", "mut-1.json"),
			);
		});
	});
});
