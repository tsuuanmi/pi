import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamTask, executeTeam, readTeamSnapshot, startTeam } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamEventsPath, teamReceiptsPath, teamRoleRunPath, teamTaskPath } from "#workflows/session/session-layout";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { saveTeamExecution } from "#workflows/skills/team/execution-store";
import type { TeamSnapshot, TeamTaskExecution } from "#workflows/skills/team/runtime";
import { createFakeManager, createTeamContext } from "#workflows-test/team/fakes";

const sessionId = "persistence-test";
const teamId = "team-1";

function createAgents() {
	return createTeamAgents(
		createTeamContext(
			createFakeManager(async () => {}),
			sessionId,
		),
		[{ id: "worker", profile: "worker", capabilities: ["worker"] }],
	);
}

describe("team persistence failures", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "pi-team-persistence-"));
		await startTeam(cwd, { teamId, task: "Approved team task" }, sessionId);
		await createTeamTask(cwd, { teamId, id: "task-1", title: "Task", description: "Execute task" }, sessionId);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("does not report success when receipt persistence fails", async () => {
		await mkdir(teamReceiptsPath(cwd, teamId, sessionId), { recursive: true });
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);

		await expect(runTeam(cwd, snapshot, "run-receipt-failure")).rejects.toThrow(
			"team execution failure persistence failed",
		);
		const failed = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(failed.tasks[0]?.execution?.status).toBe("failed");
	});

	it("preserves receipts when event persistence fails", async () => {
		const path = teamEventsPath(cwd, teamId, sessionId);
		await rm(path);
		await mkdir(path, { recursive: true });
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);

		await expect(runTeam(cwd, snapshot, "run-event-failure")).rejects.toThrow(
			"team execution failure persistence failed",
		);
		const failed = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(failed.tasks[0]?.execution?.status).toBe("failed");
		await expect(readFile(teamReceiptsPath(cwd, teamId, sessionId), "utf8")).resolves.toContain("task-1");
	});

	it("surfaces task-state persistence failure without success", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const path = teamTaskPath(cwd, teamId, "task-1", sessionId);
		await rm(path);
		await mkdir(path, { recursive: true });

		await expect(runTeam(cwd, snapshot, "run-task-failure")).rejects.toThrow(
			"team execution failure persistence failed",
		);
		await expect(readFile(teamRoleRunPath(cwd, teamId, sessionId, "run-task-failure"), "utf8")).resolves.toContain(
			"run-task-failure",
		);
	});

	it("fails closed when an execution result is stale", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const current: TeamTaskExecution = {
			status: "completed",
			updated_at: "2099-01-01T00:00:00.000Z",
			receipt_ids: ["receipt-current"],
		};
		await saveTeamExecution(cwd, sessionId, {
			...snapshot,
			tasks: snapshot.tasks.map((task) => (task.id === "task-1" ? { ...task, execution: current } : task)),
		});

		await expect(runTeam(cwd, snapshot, "run-stale")).rejects.toThrow("team execution failure persistence failed");
		const persisted = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(persisted.tasks[0]?.execution).toEqual(current);
	});

	it("fails closed when synthetic role failure persistence fails", async () => {
		await mkdir(teamRoleRunPath(cwd, teamId, sessionId, "run-role-failure"), { recursive: true });
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);

		await expect(
			executeTeam({
				cwd,
				sessionId,
				runId: "run-role-failure",
				role: "prover",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: [],
				agents: [],
			}),
		).rejects.toThrow("team execution failure persistence failed");
	});
});

async function runTeam(cwd: string, snapshot: TeamSnapshot, runId: string) {
	return executeTeam({
		cwd,
		sessionId,
		runId,
		role: "worker",
		snapshot,
		tasks: snapshot.tasks,
		persistIds: ["task-1"],
		agents: createAgents(),
		routes: { "task-1": { capabilities: ["worker"] } },
	});
}
