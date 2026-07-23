import type { UltragoalStatus } from "#workflows/skills/ultragoal/ultragoal-runtime";

/**
 * Input for {@link projectUltragoalCompact}: the I/O-read ultragoal status, the
 * ultragoal workflow state (for `current_phase`), and the resolved state path.
 * The reader assembles this from its I/O; the projection is pure over it.
 */
export interface UltragoalCompactInput {
	status: UltragoalStatus;
	state: { current_phase?: string } | undefined;
	statePath: string;
}

/**
 * Pure projection from ultragoal runtime I/O to a prompt-efficient compact
 * state. Deterministic and side-effect free. Separated from the I/O in
 * `readUltragoalCompact` so it can be registered in the shared compact-state
 * registry without coupling the registry to ultragoal's I/O.
 */
export function projectUltragoalCompact(input: UltragoalCompactInput): Record<string, unknown> {
	const { status, state, statePath } = input;
	return {
		state_path: statePath,
		phase: state?.current_phase,
		status: status.status,
		plan_hash: status.planHash,
		counts: status.counts,
		main_goal: status.mainGoal
			? {
					id: status.mainGoal.id,
					title: status.mainGoal.title,
					objective: status.mainGoal.objective,
				}
			: undefined,
		last_checkpoint: status.lastCheckpoint
			? {
					id: status.lastCheckpoint.checkpointId,
					goal_id: status.lastCheckpoint.goalId,
					status: status.lastCheckpoint.status,
					path: status.lastCheckpoint.path,
					restore_warning: status.lastCheckpoint.restoreWarning,
				}
			: undefined,
		current_goal: status.currentGoal
			? {
					id: status.currentGoal.id,
					title: status.currentGoal.title,
					objective: status.currentGoal.objective,
					status: status.currentGoal.status,
				}
			: undefined,
		goals: status.goals.map((goal) => ({ id: goal.id, title: goal.title, status: goal.status })),
	};
}
