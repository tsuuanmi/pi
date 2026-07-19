import type { TeamConfig, TeamSnapshot } from "#src/harness/team/team-runtime";

/**
 * Input for {@link projectTeamCompact}: the I/O-read team snapshot and the
 * resolved completion gate (only present when `snapshot.team_id` exists). The
 * reader assembles this from its I/O; the projection is pure over it.
 */
export interface TeamCompactInput {
	snapshot: TeamSnapshot;
	completionGate: TeamConfig["completion_gate"] | undefined;
}

/**
 * Pure projection from team runtime I/O to a prompt-efficient compact state.
 * Deterministic and side-effect free. Separated from the I/O in
 * `readTeamCompact` so it can be registered in the shared compact-state
 * registry without coupling the registry to team's I/O.
 */
export function projectTeamCompact(input: TeamCompactInput): Record<string, unknown> {
	const { snapshot, completionGate } = input;
	return {
		team_id: snapshot.team_id,
		phase: snapshot.phase,
		task_counts: snapshot.task_counts,
		completion_gate: completionGate,
		workers: snapshot.workers.map((worker) => ({ id: worker.id, role: worker.role, status: worker.status })),
		tasks: snapshot.tasks.map((task) => ({
			id: task.id,
			title: task.title,
			status: task.status,
			assignee: task.assignee,
			blocked_by: task.blocked_by,
		})),
	};
}
