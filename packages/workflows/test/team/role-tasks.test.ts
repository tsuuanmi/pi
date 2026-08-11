import { describe, expect, it } from "vitest";
import type { ExpectedNextRole } from "#workflows/policy/expected-next-role";
import { createRoleBatch } from "#workflows/skills/team/role-tasks";
import type { TeamSnapshot } from "#workflows/skills/team/types";

const snapshot: TeamSnapshot = {
	team_id: "team-1",
	phase: "running",
	task_total: 1,
	task_counts: { pending: 1, blocked: 0, in_progress: 0, completed: 0, failed: 0 },
	workers: [],
	tasks: [
		{
			version: 1,
			id: "task-1",
			title: "Implement task",
			description: "Make the change",
			status: "pending",
			created_at: "2026-08-02T00:00:00.000Z",
			updated_at: "2026-08-02T00:00:00.000Z",
		},
	],
	updated_at: "2026-08-02T00:00:00.000Z",
};

function role(roleName: string, taskId?: string): ExpectedNextRole {
	return { skill: "team", stage: roleName, role: roleName, owner: "team_execute", teamId: "team-1", taskId };
}

describe("team role batches", () => {
	it("creates a routed worker batch for the selected task", () => {
		const batch = createRoleBatch(snapshot, role("worker", "task-1"), "run-1");

		expect(batch.persistIds).toEqual(["task-1"]);
		expect(batch.routes).toEqual({ "task-1": { capabilities: ["worker"] } });
		expect(batch.tasks[0]?.description).toContain("You are the worker");
	});

	it("creates a routed reviewer batch without changing workflow status", () => {
		const batch = createRoleBatch(snapshot, role("reviewer", "task-1"), "run-2");

		expect(batch.persistIds).toEqual(["task-1"]);
		expect(batch.routes).toEqual({ "task-1": { capabilities: ["reviewer"] } });
		expect(batch.tasks[0]?.status).toBe("pending");
		expect(batch.tasks[0]?.description).toContain("You are the reviewer");
	});

	it("creates a synthetic prover batch without persisting a workflow task", () => {
		const batch = createRoleBatch(snapshot, role("prover"), "run-3");

		expect(batch.persistIds).toEqual([]);
		expect(batch.routes).toEqual({ "team-1-prover-run-3": { capabilities: ["prover"] } });
		expect(batch.tasks[0]?.id).toBe("team-1-prover-run-3");
		expect(batch.tasks[0]?.description).toContain("evidence_matrix");
	});
});
