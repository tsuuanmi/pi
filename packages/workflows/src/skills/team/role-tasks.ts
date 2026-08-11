import type { ExpectedNextRole } from "#workflows/policy/expected-next-role";
import { createRunnableTask } from "#workflows/skills/team/dependencies";
import type { TeamTaskRoute } from "#workflows/skills/team/task-mapper";
import type { TeamSnapshot, TeamTask } from "#workflows/skills/team/types";

export interface RoleBatch {
	tasks: readonly TeamTask[];
	persistIds: readonly string[];
	routes: Readonly<Record<string, TeamTaskRoute>>;
}

export function createRoleBatch(snapshot: TeamSnapshot, role: ExpectedNextRole, runId: string): RoleBatch {
	switch (role.role) {
		case "worker":
			return createWorkerBatch(snapshot, role);
		case "reviewer":
			return createReviewerBatch(snapshot, role);
		case "prover":
			return createProverBatch(snapshot, runId);
		default:
			throw new Error(`unsupported team role: ${role.role}`);
	}
}

function createWorkerBatch(snapshot: TeamSnapshot, role: ExpectedNextRole): RoleBatch {
	const task = createRunnableTask(findTask(snapshot, role.taskId), snapshot.tasks);
	if (task.execution && !["failed", "blocked", "skipped"].includes(task.execution.status)) {
		throw new Error(`worker task already has successful execution state: ${task.id}`);
	}
	return {
		tasks: [
			{
				...task,
				status: "pending",
				execution: undefined,
				description: `${task.description}\n\nYou are the worker. Implement this task, run focused checks, and report concrete completion evidence.`,
			},
		],
		persistIds: [task.id],
		routes: { [task.id]: { capabilities: ["worker"] } },
	};
}

function createReviewerBatch(snapshot: TeamSnapshot, role: ExpectedNextRole): RoleBatch {
	const task = findTask(snapshot, role.taskId);
	return {
		tasks: [
			{
				...task,
				status: "pending",
				execution: undefined,
				description: `${task.description}\n\nYou are the reviewer. Inspect the implementation and evidence. Record a structured review_report with the team review gate before returning.`,
			},
		],
		persistIds: [task.id],
		routes: { [task.id]: { capabilities: ["reviewer"] } },
	};
}

function createProverBatch(snapshot: TeamSnapshot, runId: string): RoleBatch {
	const id = `${snapshot.team_id}-prover-${runId}`;
	const now = new Date().toISOString();
	return {
		tasks: [
			{
				version: 1,
				id,
				title: "Prove team completion",
				description: `Verify team ${snapshot.team_id} against concrete evidence. Record an evidence_matrix with the team completion gate before returning.`,
				status: "pending",
				created_at: now,
				updated_at: now,
			},
		],
		persistIds: [],
		routes: { [id]: { capabilities: ["prover"] } },
	};
}

function findTask(snapshot: TeamSnapshot, taskId: string | undefined): TeamTask {
	if (!taskId) throw new Error("team role requires a task id");
	const task = snapshot.tasks.find((item) => item.id === taskId);
	if (!task) throw new Error(`team task not found: ${taskId}`);
	return task;
}
