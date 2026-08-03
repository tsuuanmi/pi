import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamTask, executeTeam, readTeamSnapshot, startTeam } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { createFakeManager, createTeamContext } from "#workflows-test/team/fakes";

const sessionId = "routing-test";
const teamId = "team-1";

describe("team capability routing", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "pi-team-routing-"));
		await startTeam(cwd, { teamId, task: "Approved team task" }, sessionId);
		await createTeamTask(cwd, { teamId, id: "task-1", title: "Task", description: "Execute task" }, sessionId);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("fails closed when no agent has the required capability", async () => {
		const roles: string[] = [];
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const agents = createTeamAgents(
			createTeamContext(
				createFakeManager(async (request) => {
					if (!request.role) throw new Error("routing test request is missing a role");
					roles.push(request.role);
				}),
				sessionId,
			),
			[{ id: "worker", profile: "worker", capabilities: ["worker"] }],
		);

		await expect(
			executeTeam({
				cwd,
				sessionId,
				runId: "run-missing-reviewer",
				role: "reviewer",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: ["task-1"],
				agents,
				routes: { "task-1": { capabilities: ["reviewer"] } },
			}),
		).rejects.toThrow('No eligible agent for task "Task"');
		expect(roles).toEqual([]);
		const failed = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(failed.tasks[0]?.execution?.status).toBe("failed");
	});
});
