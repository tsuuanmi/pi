import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	readWorkflowActiveState,
	readWorkflowState,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

describe("team workflow runtime", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
		await recordTeamReviewGateArtifact(
			cwd,
			{
				teamId: "team-1",
				taskId: "task-1",
				reviewReport: { max_severity: "none", needs_changes: false, summary: "No review blockers." },
			},
			sessionId,
		);
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

		await recordTeamCompletionGateArtifact(
			cwd,
			{
				teamId: "team-1",
				evidenceMatrix: {
					ship_decision: "ship",
					escalation: "none",
					summary: "Team work verified for completion.",
				},
			},
			sessionId,
		);
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
