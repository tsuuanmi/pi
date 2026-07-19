import type { UltragoalStatus } from "#src/harness/ultragoal/ultragoal-runtime";

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
		counts: status.counts,
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
