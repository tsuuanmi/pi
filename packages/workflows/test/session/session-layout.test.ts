import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { piGlobalRoot, piSessionRoot } from "@tsuuanmi/pi/session/root";
import {
	assertSafePathComponent,
	auditLogPath,
	transactionJournalPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("session-layout", () => {
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
