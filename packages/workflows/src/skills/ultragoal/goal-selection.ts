import type { UltragoalGoal, UltragoalGoalStatus, UltragoalPlan } from "#workflows/skills/ultragoal/receipt";

export const TERMINAL_STATUSES = new Set<UltragoalGoalStatus>(["complete", "superseded"]);
export const SCHEDULABLE_STATUSES = new Set<UltragoalGoalStatus>(["pending", "active", "failed"]);

export function emptyCounts(): Record<UltragoalGoalStatus, number> {
	return { pending: 0, active: 0, complete: 0, failed: 0, blocked: 0, review_blocked: 0, superseded: 0 };
}

export function chooseNextGoal(plan: UltragoalPlan, retryFailed: boolean): UltragoalGoal | undefined {
	return (
		plan.goals.find((goal) => goal.status === "active") ??
		plan.goals.find((goal) => goal.status === "pending") ??
		(retryFailed ? plan.goals.find((goal) => goal.status === "failed") : undefined)
	);
}
