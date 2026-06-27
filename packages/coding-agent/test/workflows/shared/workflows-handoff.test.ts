import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	applyHandoffToActiveState,
	readWorkflowActiveState,
	syncWorkflowActiveState,
	type WorkflowActiveEntry,
} from "../../../src/workflows/shared/active-state.ts";
import { workflowActiveStatePath } from "../../../src/workflows/shared/session-layout.ts";

const TEST_SESSION = "test-session-id";

async function readRawEntries(cwd: string, sessionId: string): Promise<WorkflowActiveEntry[]> {
	const raw = JSON.parse(await readFile(workflowActiveStatePath(cwd, sessionId), "utf8"));
	return raw.active_workflows as WorkflowActiveEntry[];
}

describe("workflow handoff protocol", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-handoff-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("demotes caller and promotes callee in a single atomic write", async () => {
		// Seed: deep-interview is active
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: TEST_SESSION },
		);

		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff", state_path: "/di.json" },
			callee: { skill: "ralplan", phase: "planner", state_path: "/ralplan.json" },
			sessionId: TEST_SESSION,
		});

		const state = await readWorkflowActiveState(cwd, { sessionId: TEST_SESSION });
		const di = state?.active_workflows.find((e) => e.skill === "deep-interview");
		const ralplan = state?.active_workflows.find((e) => e.skill === "ralplan");
		expect(di).toBeUndefined(); // demoted → filtered from active list
		expect(ralplan).toBeDefined();
		expect(ralplan?.phase).toBe("planner");
	});

	it("sets handoff metadata on both entries", async () => {
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: TEST_SESSION },
		);

		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff" },
			callee: { skill: "ralplan", phase: "planner" },
			sessionId: TEST_SESSION,
			nowIso: "2026-06-20T00:00:00.000Z",
		});

		const entries = await readRawEntries(cwd, TEST_SESSION);
		const di = entries.find((e) => e.skill === "deep-interview");
		const ralplan = entries.find((e) => e.skill === "ralplan");
		expect(di?.active).toBe(false);
		expect(di?.handoff_to).toBe("ralplan");
		expect(di?.handoff_at).toBe("2026-06-20T00:00:00.000Z");
		expect(ralplan?.active).toBe(true);
		expect(ralplan?.handoff_from).toBe("deep-interview");
		expect(ralplan?.handoff_at).toBe("2026-06-20T00:00:00.000Z");
	});

	it("tags both entries with session_id when provided", async () => {
		const sessionId = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId },
		);

		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff" },
			callee: { skill: "ralplan", phase: "planner" },
			sessionId,
		});

		const entries = await readRawEntries(cwd, sessionId);
		const di = entries.find((e) => e.skill === "deep-interview" && e.session_id === sessionId);
		const ralplan = entries.find((e) => e.skill === "ralplan" && e.session_id === sessionId);
		expect(di?.active).toBe(false);
		expect(di?.handoff_to).toBe("ralplan");
		expect(ralplan?.active).toBe(true);
		expect(ralplan?.handoff_from).toBe("deep-interview");
	});

	it("preserves other entries not involved in the handoff", async () => {
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: TEST_SESSION },
		);
		await syncWorkflowActiveState(
			cwd,
			{ skill: "ultragoal", active: true, phase: "running" },
			{ sessionId: TEST_SESSION },
		);

		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff" },
			callee: { skill: "ralplan", phase: "planner" },
			sessionId: TEST_SESSION,
		});

		const state = await readWorkflowActiveState(cwd, { sessionId: TEST_SESSION });
		const skills = state?.active_workflows.map((e) => e.skill).sort();
		expect(skills).toEqual(["ralplan", "ultragoal"]);
	});

	it("preserves caller lineage across multi-step handoff chains", async () => {
		// Step 1: deep-interview → ralplan
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: TEST_SESSION },
		);
		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff" },
			callee: { skill: "ralplan", phase: "planner" },
			sessionId: TEST_SESSION,
			nowIso: "2026-06-20T01:00:00.000Z",
		});

		// Step 2: ralplan → ultragoal
		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "ralplan", phase: "handoff" },
			callee: { skill: "ultragoal", phase: "running" },
			sessionId: TEST_SESSION,
			nowIso: "2026-06-20T02:00:00.000Z",
		});

		const entries = await readRawEntries(cwd, TEST_SESSION);
		const ralplan = entries.find((e) => e.skill === "ralplan");
		const ultragoal = entries.find((e) => e.skill === "ultragoal");
		// ralplan was demoted in step 2 with handoff_to: ultragoal
		expect(ralplan?.active).toBe(false);
		expect(ralplan?.handoff_to).toBe("ultragoal");
		expect(ralplan?.handoff_at).toBe("2026-06-20T02:00:00.000Z");
		// ultragoal was promoted with handoff_from: ralplan
		expect(ultragoal?.active).toBe(true);
		expect(ultragoal?.handoff_from).toBe("ralplan");
		expect(ultragoal?.handoff_at).toBe("2026-06-20T02:00:00.000Z");
	});

	it("session-scoped handoff does not affect other sessions", async () => {
		const sessionA = "0192aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const sessionB = "0192ffff-0000-0000-0000-000000000000";

		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: sessionA },
		);
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: sessionB },
		);

		// Session A hands off
		await applyHandoffToActiveState({
			cwd,
			caller: { skill: "deep-interview", phase: "handoff" },
			callee: { skill: "ralplan", phase: "planner" },
			sessionId: sessionA,
		});

		// Session A: DI demoted, ralplan promoted
		const stateA = await readWorkflowActiveState(cwd, { sessionId: sessionA });
		expect(stateA?.active_workflows.find((e) => e.skill === "deep-interview")).toBeUndefined();
		expect(stateA?.active_workflows.find((e) => e.skill === "ralplan")).toBeDefined();

		// Session B: DI still active (its own entry untouched)
		const stateB = await readWorkflowActiveState(cwd, { sessionId: sessionB });
		expect(stateB?.active_workflows.find((e) => e.skill === "deep-interview")).toBeDefined();
		expect(stateB?.active_workflows.find((e) => e.skill === "ralplan")).toBeUndefined();
	});
});
