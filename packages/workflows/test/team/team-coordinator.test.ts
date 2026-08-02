import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	completeTeam,
	createTeamTask,
	executeRole,
	readTeamSnapshot,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
	startTeam,
	transitionTeamTask,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamReceiptsPath } from "#workflows/session/session-layout";
import type { WorkflowContext } from "#workflows/tools/workflow-tools";
import { createFakeManager } from "#workflows-test/team/team-fakes";

const sessionId = "team-coordinator-session";
const teamId = "team-coordinator";
const agents = [
	{ id: "worker", profile: "worker", capabilities: ["worker"] },
	{ id: "reviewer", profile: "reviewer", capabilities: ["reviewer"] },
	{ id: "prover", profile: "prover", capabilities: ["prover"] },
] as const;

describe("team coordinator", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "pi-team-coordinator-"));
		await startTeam(cwd, { teamId, task: "Coordinate one task" }, sessionId);
		await createTeamTask(
			cwd,
			{ teamId, id: "task-1", title: "Implement task", description: "Implement the task" },
			sessionId,
		);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("progresses a task through worker, reviewer, and prover roles", async () => {
		const roles: string[] = [];
		const manager = createFakeManager(async (request) => {
			const role = request.role;
			if (!role) throw new Error("team role request is missing a role");
			roles.push(role);
			if (role === "reviewer") {
				await recordTeamReviewGateArtifact(
					cwd,
					{
						teamId,
						taskId: "task-1",
						reviewReport: { max_severity: "none", needs_changes: false, summary: "Review passed." },
						recordedBy: role,
					},
					sessionId,
				);
				await transitionTeamTask(
					cwd,
					{
						teamId,
						taskId: "task-1",
						status: "completed",
						evidence: {
							summary: "Implemented and verified the requested task changes.",
							recorded_by: role,
						},
					},
					sessionId,
				);
			}
			if (role === "prover") {
				await recordTeamCompletionGateArtifact(
					cwd,
					{
						teamId,
						evidenceMatrix: {
							ship_decision: "ship",
							escalation: "none",
							summary: "Completion evidence passed.",
						},
						recordedBy: role,
					},
					sessionId,
				);
			}
		});
		const context: WorkflowContext = { cwd, sessionManager: { getSessionId: () => sessionId }, subagents: manager };

		await executeRole({ teamId, agents }, context, undefined);
		let snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(snapshot.tasks[0]?.status).toBe("in_progress");
		expect(snapshot.tasks[0]?.execution?.status).toBe("completed");

		await executeRole({ teamId, agents }, context, undefined);
		snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(snapshot.tasks[0]?.status).toBe("completed");
		expect(snapshot.tasks[0]?.review_gate?.status).toBe("passed");

		await executeRole({ teamId, agents }, context, undefined);
		snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(snapshot.completion_gate?.status).toBe("passed");
		expect(roles).toEqual(["worker", "reviewer", "prover"]);

		const receipts = (await readFile(teamReceiptsPath(cwd, teamId, sessionId), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { role: string });
		expect(receipts.map((receipt) => receipt.role)).toEqual(["worker", "reviewer", "prover"]);

		const completed = await completeTeam(cwd, { teamId, summary: "Completed" }, sessionId);
		expect(completed.phase).toBe("complete");
	});
});
