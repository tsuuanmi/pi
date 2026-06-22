import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	assertNonEmptySessionId,
	assertSafePathComponent,
	auditLogPath,
	decodeSessionSegment,
	encodeSessionSegment,
	PI_SESSION_PREFIX,
	piGlobalRoot,
	piSessionRoot,
	sessionActivityPath,
	sessionDirName,
	sessionIdFromDirName,
	transactionJournalPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "../src/workflows/shared/session-layout.ts";
import {
	detectLatestSession,
	resolvePiSessionForRead,
	resolvePiSessionForWrite,
	writeSessionActivityMarker,
} from "../src/workflows/shared/session-resolution.ts";

describe("session-layout", () => {
	describe("encodeSessionSegment / decodeSessionSegment", () => {
		it("round-trips simple ASCII ids", () => {
			const id = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
			expect(decodeSessionSegment(encodeSessionSegment(id))).toBe(id);
		});

		it("escapes dots to prevent path traversal", () => {
			const encoded = encodeSessionSegment("a.b.c");
			expect(encoded).not.toContain(".");
			expect(decodeSessionSegment(encoded)).toBe("a.b.c");
		});

		it("escapes special characters", () => {
			const id = "hello world/test";
			const encoded = encodeSessionSegment(id);
			expect(encoded).not.toContain("/");
			expect(decodeSessionSegment(encoded)).toBe(id);
		});
	});

	describe("assertNonEmptySessionId", () => {
		it("accepts valid session ids", () => {
			expect(() => assertNonEmptySessionId("abc123", "test")).not.toThrow();
		});

		it("throws on blank session ids", () => {
			expect(() => assertNonEmptySessionId("", "write")).toThrow(/No session ID/);
			expect(() => assertNonEmptySessionId("  ", "write")).toThrow(/No session ID/);
			expect(() => assertNonEmptySessionId(undefined, "write")).toThrow(/No session ID/);
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
		it("produces prefixed directory names", () => {
			expect(sessionDirName("abc")).toBe("_session-abc");
		});

		it("round-trips through encodeSessionSegment", () => {
			const id = "test.session.id";
			const dirName = sessionDirName(id);
			expect(dirName).toContain(PI_SESSION_PREFIX);
			expect(sessionIdFromDirName(dirName)).toBe(id);
		});

		it("returns undefined for non-session directory names", () => {
			expect(sessionIdFromDirName("workflows")).toBeUndefined();
			expect(sessionIdFromDirName("state")).toBeUndefined();
		});
	});

	describe("piGlobalRoot", () => {
		it("returns global .pi path", () => {
			expect(piGlobalRoot("/project")).toBe(join("/project", ".pi"));
		});
	});

	describe("piSessionRoot", () => {
		it("returns session-scoped root directory", () => {
			expect(piSessionRoot("/project", "sess-1")).toBe(join("/project", ".pi", "_session-sess-1"));
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
				join(cwd, ".pi", "_session-sess-1", "workflows", "ralplan", "state.json"),
			);
		});

		it("workflowActiveStatePath resolves to session dir", () => {
			expect(workflowActiveStatePath(cwd, "sess-1")).toBe(
				join(cwd, ".pi", "_session-sess-1", "workflows", "active-state.json"),
			);
		});

		it("auditLogPath stays global regardless of session", () => {
			expect(auditLogPath(cwd)).toBe(join(cwd, ".pi", "state", "audit.jsonl"));
		});

		it("transactionJournalPath stays global regardless of session", () => {
			expect(transactionJournalPath(cwd, "mut-1")).toBe(join(cwd, ".pi", "state", "transactions", "mut-1.json"));
		});
	});
});

describe("session-resolution", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-session-res-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	describe("resolveSessionIdFromSources", () => {
		it("prefers flag over payload and env", async () => {
			const result = await resolvePiSessionForRead(cwd, {
				flagValue: "flag-id",
				payloadSessionId: "payload-id",
				envSessionId: "env-id",
			});
			expect(result?.sessionId).toBe("flag-id");
			expect(result?.source).toBe("flag");
		});

		it("prefers payload over env", async () => {
			const result = await resolvePiSessionForRead(cwd, {
				payloadSessionId: "payload-id",
				envSessionId: "env-id",
			});
			expect(result?.sessionId).toBe("payload-id");
			expect(result?.source).toBe("payload");
		});

		it("uses env as last resort", async () => {
			const result = await resolvePiSessionForRead(cwd, { envSessionId: "env-id" });
			expect(result?.sessionId).toBe("env-id");
			expect(result?.source).toBe("env");
		});

		it("throws blank_flag on blank flag value", async () => {
			await expect(resolvePiSessionForRead(cwd, { flagValue: "  " })).rejects.toThrow(/blank/);
		});
	});

	describe("resolvePiSessionForWrite", () => {
		it("requires a session id for write", async () => {
			await expect(resolvePiSessionForWrite(cwd, {})).rejects.toThrow(/No session ID/);
		});

		it("resolves from flag", async () => {
			const result = await resolvePiSessionForWrite(cwd, { flagValue: "sess-1" });
			expect(result?.sessionId).toBe("sess-1");
		});
	});

	describe("detectLatestSession", () => {
		it("returns undefined when no sessions exist", async () => {
			const result = await detectLatestSession(cwd);
			expect(result).toBeUndefined();
		});

		it("returns the latest session with an activity marker", async () => {
			await mkdir(join(cwd, ".pi", "_session-sess-1", "workflows"), { recursive: true });
			await mkdir(join(cwd, ".pi", "_session-sess-2", "workflows"), { recursive: true });
			await writeSessionActivityMarker(cwd, "sess-1");
			// Delay so sess-2 has a clearly newer timestamp (beyond tie window)
			await new Promise((resolve) => setTimeout(resolve, 1100));
			await writeSessionActivityMarker(cwd, "sess-2");

			const result = await detectLatestSession(cwd);
			expect(result?.sessionId).toBe("sess-2");
		});

		it("ignores sessions without activity markers", async () => {
			await mkdir(join(cwd, ".pi", "_session-sess-1", "workflows"), { recursive: true });
			// No activity marker for sess-1

			const result = await detectLatestSession(cwd);
			expect(result).toBeUndefined();
		});
	});

	describe("writeSessionActivityMarker", () => {
		it("creates an activity marker file", async () => {
			await writeSessionActivityMarker(cwd, "sess-1");
			const path = sessionActivityPath(cwd, "sess-1");
			const { readFile } = await import("node:fs/promises");
			const content = JSON.parse(await readFile(path, "utf8"));
			expect(content.session_id).toBe("sess-1");
			expect(content.created_at).toBeDefined();
		});

		it("updates updated_at on subsequent writes", async () => {
			await writeSessionActivityMarker(cwd, "sess-1");
			await new Promise((resolve) => setTimeout(resolve, 10));
			await writeSessionActivityMarker(cwd, "sess-1");
			const path = sessionActivityPath(cwd, "sess-1");
			const { readFile } = await import("node:fs/promises");
			const content = JSON.parse(await readFile(path, "utf8"));
			expect(content.created_at).toBeDefined();
			expect(content.updated_at).not.toBe(content.created_at);
		});
	});
});
