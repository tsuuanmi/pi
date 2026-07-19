import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createWorkflowReceipt,
	isEntryStale,
	readWorkflowActiveState,
	syncWorkflowActiveState,
	WORKFLOW_RECEIPT_FRESH_MS,
	workflowReceiptStatus,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

describe("receipt freshness and staleness", () => {
	it("createWorkflowReceipt includes fresh_until and status", () => {
		const receipt = createWorkflowReceipt({
			skill: "ralplan",
			statePath: "/.pi/workflows/ralplan.json",
			command: "pi ralplan write",
			mutatedAt: "2026-06-20T00:00:00.000Z",
		});
		expect(receipt.fresh_until).toBeDefined();
		expect(receipt.status).toBe("fresh");
		expect(receipt.mutation_id).toBeDefined();
		// fresh_until = mutatedAt + 30 min
		const freshMs = Date.parse(receipt.fresh_until as string);
		expect(freshMs - Date.parse("2026-06-20T00:00:00.000Z")).toBe(WORKFLOW_RECEIPT_FRESH_MS);
	});

	it("workflowReceiptStatus returns fresh within the window", () => {
		const receipt = createWorkflowReceipt({
			skill: "ralplan",
			statePath: "/path",
			command: "cmd",
			mutatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
		});
		expect(workflowReceiptStatus(receipt as { fresh_until?: string })).toBe("fresh");
	});

	it("workflowReceiptStatus returns stale after the window", () => {
		const receipt = createWorkflowReceipt({
			skill: "ralplan",
			statePath: "/path",
			command: "cmd",
			mutatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
		});
		expect(workflowReceiptStatus(receipt as { fresh_until?: string })).toBe("stale");
	});

	it("workflowReceiptStatus returns undefined for missing receipt", () => {
		expect(workflowReceiptStatus(undefined)).toBeUndefined();
		expect(workflowReceiptStatus({})).toBeUndefined();
	});

	it("isEntryStale returns false for recent timestamps", () => {
		expect(isEntryStale(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe(false);
	});

	it("isEntryStale returns true for old timestamps", () => {
		expect(isEntryStale(new Date(Date.now() - 45 * 60 * 1000).toISOString())).toBe(true);
	});

	it("isEntryStale returns true for missing or invalid timestamps", () => {
		expect(isEntryStale(undefined)).toBe(true);
		expect(isEntryStale("not-a-date")).toBe(true);
	});
});

describe("active-state staleness detection", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("marks entries as stale when updated_at is outside the freshness window", async () => {
		// Write an entry with a timestamp 45 minutes ago
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
			},
			{ sessionId },
		);

		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((e) => e.skill === "ralplan");
		expect(ralplan?.stale).toBe(true);
	});

	it("does not mark recent entries as stale", async () => {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				updated_at: new Date().toISOString(),
			},
			{ sessionId },
		);

		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((e) => e.skill === "ralplan");
		expect(ralplan?.stale).toBeUndefined();
	});

	it("escalates HUD severity to warning for stale entries", async () => {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				hud: { version: 1, summary: "Planning", severity: "info" },
				updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
			},
			{ sessionId },
		);

		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((e) => e.skill === "ralplan");
		expect(ralplan?.stale).toBe(true);
		expect(ralplan?.hud?.severity).toBe("warning");
	});

	it("preserves existing error severity for stale entries", async () => {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: true,
				phase: "planner",
				hud: { version: 1, summary: "Failed", severity: "error" },
				updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
			},
			{ sessionId },
		);

		const state = await readWorkflowActiveState(cwd, { sessionId });
		const ralplan = state?.active_workflows.find((e) => e.skill === "ralplan");
		expect(ralplan?.hud?.severity).toBe("error");
	});
});
