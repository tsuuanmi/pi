import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readWorkflowActiveState } from "../src/workflows/shared/active-state.ts";
import { readWorkflowState } from "../src/workflows/shared/workflow-state.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "../src/workflows/team/team-runtime.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	startNextUltragoalGoal,
} from "../src/workflows/ultragoal/ultragoal-runtime.ts";

/** Minimal valid typed quality gate for cli-surface completion (no real artifacts). */
function cliQualityGate(): Record<string, unknown> {
	return {
		executorQa: {
			artifactRefs: [
				{
					id: "a1",
					kind: "cli-replay",
					description: "Ran focused checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "checks passed" },
				},
			],
			surfaceEvidence: [
				{
					id: "s1",
					surface: "cli",
					contractRef: "plan#a",
					invocation: "npm run check",
					result: "passed",
					artifactRefs: ["a1"],
				},
			],
		},
		contractCoverage: [
			{ id: "c1", contractRef: "plan#a", obligation: "focused checks pass", status: "passed", artifactRefs: ["a1"] },
		],
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
		const started = await startTeam(cwd, { teamId: "team-1", task: "Approved plan" });
		expect(started.team_id).toBe("team-1");
		expect(started.workers).toHaveLength(2);

		const task = await createTeamTask(cwd, {
			teamId: "team-1",
			id: "task-1",
			title: "Implement feature",
			description: "Change the implementation safely",
			owner: "worker-1",
		});
		expect(task.status).toBe("pending");

		await transitionTeamTask(cwd, {
			teamId: "team-1",
			taskId: "task-1",
			status: "in_progress",
			workerId: "worker-1",
		});
		await expect(
			transitionTeamTask(cwd, { teamId: "team-1", taskId: "task-1", status: "completed", workerId: "worker-1" }),
		).rejects.toThrow(/completion evidence/);
		const completed = await transitionTeamTask(cwd, {
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
		});
		expect(completed.completion_evidence?.recorded_by).toBe("worker-1");

		const message = await sendTeamMessage(cwd, {
			teamId: "team-1",
			from: "worker-1",
			to: "leader-fixed",
			body: "Ready for integration",
		});
		expect(message.message_id).toMatch(/^msg-/);
		const snapshot = await readTeamSnapshot(cwd, "team-1");
		expect(snapshot.phase).toBe("awaiting_integration");
		expect(snapshot.task_counts.completed).toBe(1);
		expect((await readTeamCompact(cwd, "team-1")).tasks).toHaveLength(1);

		const closed = await completeTeam(cwd, { teamId: "team-1", summary: "Integrated" });
		expect(closed.phase).toBe("complete");
		const state = await readWorkflowState(cwd, "team");
		expect(state?.active).toBe(false);
	});

	it("syncs team active-state HUD", async () => {
		await startTeam(cwd, { teamId: "team-2", task: "Approved parallel work" });
		const active = await readWorkflowActiveState(cwd);
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
		const plan = await createUltragoalPlan(cwd, {
			brief: "@goal Add runtime\nImplement runtime-owned state.\n@goal Verify runtime\nRun focused checks.",
		});
		expect(plan.goals.map((goal) => goal.id)).toEqual(["G001", "G002"]);

		const started = await startNextUltragoalGoal(cwd);
		expect(started.goal?.id).toBe("G001");
		await expect(
			checkpointUltragoalGoal(cwd, {
				goalId: "G001",
				status: "complete",
				evidence: "too short",
				qualityGate: cliQualityGate(),
			}),
		).rejects.toThrow(/substantive/);

		const completed = await checkpointUltragoalGoal(cwd, {
			goalId: "G001",
			status: "complete",
			evidence: "Implemented runtime-owned state and verified behavior with focused automated checks.",
			qualityGate: cliQualityGate(),
		});
		expect(completed.completionVerification?.checkpointLedgerEventId).toBeDefined();
		const status = await getUltragoalStatus(cwd);
		expect(status.counts.complete).toBe(1);
		expect(status.currentGoal?.id).toBe("G002");
		expect((await readUltragoalCompact(cwd)).current_goal).toMatchObject({ id: "G002" });
	});

	it("marks ultragoal complete and demotes active state", async () => {
		await createUltragoalPlan(cwd, { brief: "Single approved concrete goal with verification criteria." });
		await startNextUltragoalGoal(cwd);
		await checkpointUltragoalGoal(cwd, {
			goalId: "G001",
			status: "complete",
			evidence: "Completed the single approved goal and verified the intended behavior successfully.",
			qualityGate: cliQualityGate(),
		});
		const status = await getUltragoalStatus(cwd);
		expect(status.status).toBe("complete");
		const active = await readWorkflowActiveState(cwd);
		expect(active?.active_workflows.some((entry) => entry.skill === "ultragoal")).toBe(false);
	});

	it("HUD pending chip reflects remaining work, not raw counts.pending", async () => {
		await createUltragoalPlan(cwd, {
			brief: "@goal Add runtime\nImplement runtime-owned state.\n@goal Verify runtime\nRun focused checks.",
		});

		async function chip(label: string): Promise<string | undefined> {
			const active = await readWorkflowActiveState(cwd);
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
		await startNextUltragoalGoal(cwd);
		expect(await chip("done")).toBe("0");
		expect(await chip("pending")).toBe("2");

		// Completing a goal increments done and decrements remaining.
		await checkpointUltragoalGoal(cwd, {
			goalId: "G001",
			status: "complete",
			evidence: "Implemented runtime-owned state and verified behavior with focused automated checks.",
			qualityGate: cliQualityGate(),
		});
		expect(await chip("done")).toBe("1");
		expect(await chip("pending")).toBe("1");
	});

	it("marks ultragoal complete and demotes active state", async () => {
		await createUltragoalPlan(cwd, { brief: "Single approved concrete goal with verification criteria." });
		await startNextUltragoalGoal(cwd);
		await checkpointUltragoalGoal(cwd, {
			goalId: "G001",
			status: "complete",
			evidence: "Completed the single approved goal and verified the intended behavior successfully.",
			qualityGate: cliQualityGate(),
		});
		const status = await getUltragoalStatus(cwd);
		expect(status.status).toBe("complete");
		const active = await readWorkflowActiveState(cwd);
		expect(active?.active_workflows.some((entry) => entry.skill === "ultragoal")).toBe(false);
	});
});
