import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handoffWorkflow } from "../../src/workflows/shared/handoff.ts";
import { transactionJournalPath } from "../../src/workflows/shared/paths.ts";
import { workflowActiveStatePath } from "../../src/workflows/shared/session-layout.ts";
import {
	clearWorkflowState,
	readWorkflowState,
	writeWorkflowState,
} from "../../src/workflows/shared/workflow-state.ts";

const TEST_SESSION = "test-session-id";

async function readEnvelope(
	cwd: string,
	skill: "deep-interview" | "ralplan" | "ultragoal",
): Promise<Record<string, unknown>> {
	const state = await readWorkflowState(cwd, skill, { sessionId: TEST_SESSION });
	if (!state) throw new Error(`missing ${skill} state`);
	return state as unknown as Record<string, unknown>;
}

function receiptOf(envelope: Record<string, unknown>): Record<string, unknown> {
	return envelope.receipt as Record<string, unknown>;
}

async function journalExists(cwd: string, mutationId: string): Promise<boolean> {
	try {
		await readFile(transactionJournalPath(cwd, TEST_SESSION, mutationId), "utf8");
		return true;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return false;
		throw error;
	}
}

async function readActiveEntries(cwd: string, sessionId: string): Promise<Record<string, unknown>[]> {
	const raw = JSON.parse(await readFile(workflowActiveStatePath(cwd, sessionId), "utf8"));
	return raw.active_workflows as Record<string, unknown>[];
}

describe("state-integrity transaction-backed handoff (STATE-006)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-handoff-integrity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("deep-interview -> ralplan: both-side receipts share mutationId, caller demoted, callee promoted, journal removed", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});

		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "deep-interview",
				patch: { spec_slug: "s", spec_path: "/spec.md", spec_sha256: "abc", handoff: "ralplan" },
			},
			callee: { skill: "ralplan", patch: { run_id: "run-1", input: "/spec.md" } },
			command: "pi deep-interview write-spec",
			sessionId: TEST_SESSION,
		});

		const caller = await readEnvelope(cwd, "deep-interview");
		const callee = await readEnvelope(cwd, "ralplan");
		expect(caller.active).toBe(false);
		expect(caller.current_phase).toBe("handoff");
		expect(caller.handoff_to).toBe("ralplan");
		expect(caller.spec_slug).toBe("s");
		expect(caller.spec_path).toBe("/spec.md");
		expect(caller.spec_sha256).toBe("abc");
		expect(caller.handoff).toBe("ralplan");
		expect(callee.active).toBe(true);
		expect(callee.current_phase).toBe("planner");
		expect(callee.handoff_from).toBe("deep-interview");
		expect(callee.run_id).toBe("run-1");
		expect(callee.input).toBe("/spec.md");

		// Both-side receipts share the mutationId; operations distinguish send/receive.
		expect(receiptOf(caller).operation).toBe("handoff-send");
		expect(receiptOf(callee).operation).toBe("handoff-receive");
		expect(receiptOf(caller).mutation_id).toBe(result.mutationId);
		expect(receiptOf(callee).mutation_id).toBe(result.mutationId);
		expect(receiptOf(caller).mutation_id).toBe(receiptOf(callee).mutation_id);

		// No transaction journal remains (pending -> complete -> removed).
		expect(await journalExists(cwd, result.mutationId)).toBe(false);

		// Active-state handoff-receive preserved for HUD continuity.
		const entries = await readActiveEntries(cwd, TEST_SESSION);
		const di = entries.find((e) => e.skill === "deep-interview");
		const ralplan = entries.find((e) => e.skill === "ralplan");
		expect(di?.active).toBe(false);
		expect(di?.handoff_to).toBe("ralplan");
		expect(ralplan?.active).toBe(true);
		expect(ralplan?.handoff_from).toBe("deep-interview");
	});

	it("ralplan -> ultragoal: callee promoted to its initial phase with source metadata", async () => {
		await writeWorkflowState(
			cwd,
			"ralplan",
			{ active: true, current_phase: "pending-approval", run_id: "run-1" },
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "ralplan",
				patch: {
					run_id: "run-1",
					approved: true,
					approval_target: "ultragoal",
					approved_at: "2026-06-22T00:00:00.000Z",
				},
			},
			callee: {
				skill: "ultragoal",
				patch: { input: "/plan.md", source_workflow: "ralplan", source_run_id: "run-1" },
			},
			command: "pi ralplan approve",
			sessionId: TEST_SESSION,
		});

		const caller = await readEnvelope(cwd, "ralplan");
		const callee = await readEnvelope(cwd, "ultragoal");
		expect(caller.active).toBe(false);
		expect(caller.current_phase).toBe("handoff");
		expect(caller.handoff_to).toBe("ultragoal");
		expect(callee.active).toBe(true);
		expect(callee.current_phase).toBe("approved-execution");
		expect(callee.handoff_from).toBe("ralplan");
		expect(callee.source_workflow).toBe("ralplan");
		expect(callee.source_run_id).toBe("run-1");
		expect(receiptOf(caller).mutation_id).toBe(result.mutationId);
		expect(receiptOf(callee).mutation_id).toBe(result.mutationId);
		expect(await journalExists(cwd, result.mutationId)).toBe(false);
	});

	it("rejects a handoff to a callee that already holds an active handoff from this caller", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});
		// Seed ralplan as already-active with a live handoff_from deep-interview.
		await writeWorkflowState(
			cwd,
			"ralplan",
			{
				active: true,
				current_phase: "planner",
				handoff_from: "deep-interview",
			},
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		await expect(
			handoffWorkflow({
				cwd,
				caller: { skill: "deep-interview", patch: { spec_slug: "s" } },
				callee: { skill: "ralplan", patch: { input: "/spec.md" } },
				command: "pi deep-interview write-spec",
				sessionId: TEST_SESSION,
			}),
		).rejects.toThrow(/handoff callee ralplan already holds an active handoff from deep-interview/);
	});

	it("allows re-handoff after the callee has been cleared (active:false)", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});
		// Cleared callee: active:false, current_phase "complete" (clearWorkflowPhase).
		await clearWorkflowState(cwd, "ralplan", {}, { sessionId: TEST_SESSION });
		const cleared = await readEnvelope(cwd, "ralplan");
		expect(cleared.active).toBe(false);
		expect(cleared.current_phase).toBe("complete");

		const result = await handoffWorkflow({
			cwd,
			caller: { skill: "deep-interview", patch: { spec_slug: "s2", spec_path: "/spec2.md", spec_sha256: "def" } },
			callee: { skill: "ralplan", patch: { run_id: "run-2", input: "/spec2.md" } },
			command: "pi deep-interview write-spec",
			sessionId: TEST_SESSION,
		});

		const callee = await readEnvelope(cwd, "ralplan");
		expect(callee.active).toBe(true);
		expect(callee.current_phase).toBe("planner");
		expect(callee.handoff_from).toBe("deep-interview");
		expect(await journalExists(cwd, result.mutationId)).toBe(false);
	});

	it("sessionId tags active-state entries via session_id only (no stray camelCase sessionId field)", async () => {
		const sessionId = "sess-1";
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{ active: true, current_phase: "interviewing" },
			"pi workflow state write",
			{ sessionId },
		);

		await handoffWorkflow({
			cwd,
			caller: {
				skill: "deep-interview",
				patch: { spec_slug: "s", spec_path: "/spec.md", spec_sha256: "abc", handoff: "ralplan" },
			},
			callee: { skill: "ralplan", patch: { run_id: "run-1", input: "/spec.md" } },
			command: "pi deep-interview write-spec",
			sessionId,
		});

		const entries = await readActiveEntries(cwd, sessionId);
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			// The session id is recorded as the declared `session_id` field.
			expect(entry.session_id).toBe("sess-1");
			// No stray camelCase `sessionId` field pollutes the persisted entry
			// (regression: handoffWorkflow must not spread sessionId into the
			// HandoffSide objects, only pass it at the top level).
			expect("sessionId" in entry).toBe(false);
		}
	});

	it("rejects a handoff when the caller is not active", async () => {
		// No deep-interview state at all.
		await expect(
			handoffWorkflow({
				cwd,
				caller: { skill: "deep-interview", patch: {} },
				callee: { skill: "ralplan", patch: { input: "/spec.md" } },
				command: "pi deep-interview write-spec",
				sessionId: TEST_SESSION,
			}),
		).rejects.toThrow(/handoff caller deep-interview is not active/);
	});
});
