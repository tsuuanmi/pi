import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamTask, readTeamSnapshot, startTeam } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveTeamExecution } from "#workflows/skills/team/execution-store";
import type { TeamSnapshot, TeamTaskExecution } from "#workflows/skills/team/team-runtime";

const cwdPrefix = "pi-team-execution-store-";
const sessionId = "execution-store-test";
const teamId = "team-1";

function withExecution(snapshot: TeamSnapshot, execution: TeamTaskExecution): TeamSnapshot {
	return {
		...snapshot,
		tasks: snapshot.tasks.map((task) => (task.id === "task-1" ? { ...task, execution } : task)),
	};
}

describe("team execution store", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), cwdPrefix));
		await startTeam(cwd, { teamId, task: "Approved team task" }, sessionId);
		await createTeamTask(cwd, { teamId, id: "task-1", title: "Task", description: "Execute task" }, sessionId);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("rejects an older execution", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const current: TeamTaskExecution = {
			status: "completed",
			updated_at: "2026-08-02T00:00:02.000Z",
			receipt_ids: ["receipt-1"],
		};
		await saveTeamExecution(cwd, sessionId, withExecution(snapshot, current));

		const stale = { ...current, status: "failed" as const, updated_at: "2026-08-02T00:00:01.000Z" };
		await expect(saveTeamExecution(cwd, sessionId, withExecution(snapshot, stale))).rejects.toThrow(
			"team task execution is stale: task-1",
		);
		const persisted = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(persisted.tasks[0]?.execution).toEqual(current);
	});

	it("allows an identical retry", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const execution: TeamTaskExecution = {
			status: "completed",
			updated_at: "2026-08-02T00:00:02.000Z",
			receipt_ids: ["receipt-1"],
		};
		await saveTeamExecution(cwd, sessionId, withExecution(snapshot, execution));
		await expect(saveTeamExecution(cwd, sessionId, withExecution(snapshot, execution))).resolves.toBeUndefined();
	});

	it("accepts a newer execution", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const current: TeamTaskExecution = {
			status: "completed",
			updated_at: "2026-08-02T00:00:02.000Z",
			receipt_ids: ["receipt-1"],
		};
		await saveTeamExecution(cwd, sessionId, withExecution(snapshot, current));

		const newer = { ...current, status: "failed" as const, updated_at: "2026-08-02T00:00:03.000Z" };
		await expect(saveTeamExecution(cwd, sessionId, withExecution(snapshot, newer))).resolves.toBeUndefined();
		const persisted = await readTeamSnapshot(cwd, sessionId, teamId);
		expect(persisted.tasks[0]?.execution).toEqual(newer);
	});

	it("rejects a conflicting same-timestamp execution", async () => {
		const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
		const current: TeamTaskExecution = {
			status: "completed",
			updated_at: "2026-08-02T00:00:02.000Z",
			receipt_ids: ["receipt-1"],
		};
		await saveTeamExecution(cwd, sessionId, withExecution(snapshot, current));

		const conflict = { ...current, status: "failed" as const };
		await expect(saveTeamExecution(cwd, sessionId, withExecution(snapshot, conflict))).rejects.toThrow(
			"team task execution conflicts at its timestamp: task-1",
		);
	});
});
