import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWorkflowActiveState } from "../../../src/workflows/shared/active-state.ts";
import { readWorkflowState } from "../../../src/workflows/shared/workflow-state.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "../../../src/workflows/team/team-runtime.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	startNextUltragoalGoal,
} from "../../../src/workflows/ultragoal/ultragoal-runtime.ts";

const sessionId = "test-session-id";

/** Minimal valid full quality gate for non-live API/package completion. */
function cliQualityGate(): Record<string, unknown> {
	return {
		architectReview: {
			architectureStatus: "CLEAR",
			productStatus: "CLEAR",
			codeStatus: "CLEAR",
			recommendation: "APPROVE",
			commands: ["architect review"],
			evidence: "Architecture, product, and code review found no blockers.",
			blockers: [],
		},
		executorQa: {
			status: "passed",
			e2eStatus: "passed",
			redTeamStatus: "passed",
			evidence: "Executor QA covered contracts and adversarial behavior with durable receipts.",
			e2eCommands: ["npm run check"],
			redTeamCommands: ["node -e console.log"],
			artifactRefs: [
				{
					id: "a1",
					kind: "api-package-test-report",
					description: "Ran focused checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "checks passed" },
				},
				{
					id: "r1",
					kind: "failure-mode-test-report",
					description: "Ran focused failure-mode checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "red-team checks passed" },
				},
			],
			surfaceEvidence: [
				{
					id: "s1",
					surface: "api/package",
					contractRef: "plan#a",
					invocation: "npm run check",
					result: "passed",
					artifactRefs: ["a1"],
				},
			],
			adversarialCases: [
				{
					id: "case-invalid",
					contractRef: "plan#a",
					scenario: "invalid input",
					expectedBehavior: "reject cleanly",
					result: "passed",
					artifactRefs: ["r1"],
				},
			],
			contractCoverage: [
				{
					id: "c1",
					contractRef: "plan#a",
					obligation: "focused checks pass",
					status: "passed",
					surfaceEvidenceRefs: ["s1"],
					adversarialCaseRefs: ["case-invalid"],
				},
			],
			blockers: [],
		},
		iteration: {
			status: "passed",
			fullRerun: true,
			rerunCommands: ["npm run check"],
			evidence: "Final verification reran successfully after the implementation.",
			blockers: [],
		},
	};
}

describe("team workflow runtime", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-ultragoal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("starts a team, tracks tasks, messages, compact status, and completion", async () => {
		const started = await startTeam(cwd, { teamId: "team-1", task: "Approved plan" }, sessionId);
		expect(started.team_id).toBe("team-1");
		expect(started.workers).toHaveLength(2);

		const task = await createTeamTask(
			cwd,
			{
				teamId: "team-1",
				id: "task-1",
				title: "Implement feature",
				description: "Change the implementation safely",
				owner: "worker-1",
			},
			sessionId,
		);
		expect(task.status).toBe("pending");

		await transitionTeamTask(
			cwd,
			{
				teamId: "team-1",
				taskId: "task-1",
				status: "in_progress",
				workerId: "worker-1",
			},
			sessionId,
		);
		await expect(
			transitionTeamTask(
				cwd,
				{ teamId: "team-1", taskId: "task-1", status: "completed", workerId: "worker-1" },
				sessionId,
			),
		).rejects.toThrow(/completion evidence/);
		const completed = await transitionTeamTask(
			cwd,
			{
				teamId: "team-1",
				taskId: "task-1",
				status: "completed",
				workerId: "worker-1",
				evidence: {
					summary: "Implemented the requested feature and verified the changed behavior.",
					files: ["src/example.ts"],
					verification: ["npm run check"],
					recorded_by: "worker-1",
				},
			},
			sessionId,
		);
		expect(completed.completion_evidence?.recorded_by).toBe("worker-1");

		const message = await sendTeamMessage(
			cwd,
			{
				teamId: "team-1",
				from: "worker-1",
				to: "leader-fixed",
				body: "Ready for integration",
			},
			sessionId,
		);
		expect(message.message_id).toMatch(/^msg-/);
		const snapshot = await readTeamSnapshot(cwd, sessionId, "team-1");
		expect(snapshot.phase).toBe("awaiting_integration");
		expect(snapshot.task_counts.completed).toBe(1);
		expect((await readTeamCompact(cwd, sessionId, "team-1")).tasks).toHaveLength(1);

		const closed = await completeTeam(cwd, { teamId: "team-1", summary: "Integrated" }, sessionId);
		expect(closed.phase).toBe("complete");
		const state = await readWorkflowState(cwd, "team", { sessionId });
		expect(state?.active).toBe(false);
	});

	it("syncs team active-state HUD", async () => {
		await startTeam(cwd, { teamId: "team-2", task: "Approved parallel work" }, sessionId);
		const active = await readWorkflowActiveState(cwd, { sessionId });
		const entry = active?.active_workflows.find((item) => item.skill === "team");
		expect(entry?.hud?.chips?.some((chip) => chip.label === "phase")).toBe(true);
	});
});

describe("ultragoal workflow runtime", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ultragoal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("creates goals from @goal delimiters and checkpoints with verification", async () => {
		const plan = await createUltragoalPlan(
			cwd,
			{
				brief: "@goal Add runtime\nImplement runtime-owned state.\n@goal Verify runtime\nRun focused checks.",
			},
			sessionId,
		);
		expect(plan.goals.map((goal) => goal.id)).toEqual(["G001", "G002"]);

		const started = await startNextUltragoalGoal(cwd, false, sessionId);
		expect(started.goal?.id).toBe("G001");
		await expect(
			checkpointUltragoalGoal(
				cwd,
				{
					goalId: "G001",
					status: "complete",
					evidence: "too short",
					qualityGate: cliQualityGate(),
				},
				sessionId,
			),
		).rejects.toThrow(/substantive/);

		const completed = await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented runtime-owned state and verified behavior with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		expect(completed.completionVerification?.checkpointLedgerEventId).toBeDefined();
		const status = await getUltragoalStatus(cwd, sessionId);
		expect(status.counts.complete).toBe(1);
		expect(status.currentGoal?.id).toBe("G002");
		expect((await readUltragoalCompact(cwd, sessionId)).current_goal).toMatchObject({ id: "G002" });
	});

	it("marks ultragoal complete and demotes active state", async () => {
		await createUltragoalPlan(cwd, { brief: "Single approved concrete goal with verification criteria." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Completed the single approved goal and verified the intended behavior successfully.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		const status = await getUltragoalStatus(cwd, sessionId);
		expect(status.status).toBe("complete");
		const active = await readWorkflowActiveState(cwd, { sessionId });
		expect(active?.active_workflows.some((entry) => entry.skill === "ultragoal")).toBe(false);
	});

	it("HUD pending chip reflects remaining work, not raw counts.pending", async () => {
		await createUltragoalPlan(
			cwd,
			{
				brief: "@goal Add runtime\nImplement runtime-owned state.\n@goal Verify runtime\nRun focused checks.",
			},
			sessionId,
		);

		async function chip(label: string): Promise<string | undefined> {
			const active = await readWorkflowActiveState(cwd, { sessionId });
			return active?.active_workflows
				.find((entry) => entry.skill === "ultragoal")
				?.hud?.chips?.find((chipItem) => chipItem.label === label)?.value;
		}

		// Before any goal starts: done=0, pending=2 (remaining).
		expect(await chip("done")).toBe("0");
		expect(await chip("pending")).toBe("2");

		// Starting a goal moves it pending -> active. Without the fix, the
		// pending chip would drop to 1 (raw counts.pending) before done moves,
		// making the HUD look stale. With the fix, pending stays at remaining=2.
		await startNextUltragoalGoal(cwd, false, sessionId);
		expect(await chip("done")).toBe("0");
		expect(await chip("pending")).toBe("2");

		// Completing a goal increments done and decrements remaining.
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented runtime-owned state and verified behavior with focused automated checks.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		expect(await chip("done")).toBe("1");
		expect(await chip("pending")).toBe("1");
	});

	it("marks ultragoal complete and demotes active state", async () => {
		await createUltragoalPlan(cwd, { brief: "Single approved concrete goal with verification criteria." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Completed the single approved goal and verified the intended behavior successfully.",
				qualityGate: cliQualityGate(),
			},
			sessionId,
		);
		const status = await getUltragoalStatus(cwd, sessionId);
		expect(status.status).toBe("complete");
		const active = await readWorkflowActiveState(cwd, { sessionId });
		expect(active?.active_workflows.some((entry) => entry.skill === "ultragoal")).toBe(false);
	});
});
