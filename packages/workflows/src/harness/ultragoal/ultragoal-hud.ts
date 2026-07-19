import { limitationsChip, progressChip, shipWithCaveatsChip } from "#workflows/harness/shared/hud/hud";
import type { WorkflowHudSummary } from "#workflows/harness/shared/state/active-state";
import type { UltragoalStatus } from "#workflows/harness/ultragoal/ultragoal-runtime";

/**
 * Remaining (non-terminal) goal count: pending + active + failed + blocked +
 * review_blocked. Moved here from `ultragoal-runtime.ts` because it is only used
 * by `buildUltragoalHud`.
 */
export function remainingGoalCount(status: UltragoalStatus): number {
	return (
		status.counts.pending +
		status.counts.active +
		status.counts.failed +
		status.counts.blocked +
		status.counts.review_blocked
	);
}

/**
 * Build the workflow HUD summary for an active ultragoal run.
 *
 * Extracted mechanically from `ultragoal-runtime.ts` (behavior-preserving): the
 * `UltragoalStatus` type is imported type-only, so there is no runtime import
 * cycle. `new Date().toISOString()` is inlined (matching the original
 * `nowIso()`).
 */
export function buildUltragoalHud(status: UltragoalStatus): WorkflowHudSummary {
	return {
		version: 1,
		summary: status.currentGoal ? `${status.currentGoal.id}: ${status.currentGoal.title}` : status.status,
		chips: [
			progressChip(status.counts.complete, status.goals.length, 15),
			...(status.counts.review_blocked > 0 ? [shipWithCaveatsChip("review-blocked")] : []),
			...(status.counts.blocked + status.counts.review_blocked > 0
				? [limitationsChip(status.counts.blocked + status.counts.review_blocked)]
				: []),
			{
				label: "status",
				value: status.status,
				priority: 10,
				severity:
					status.status === "blocked" || status.status === "failed"
						? "warning"
						: status.status === "complete"
							? "success"
							: undefined,
			},
			{ label: "done", value: String(status.counts.complete), priority: 20 },
			// "pending" = remaining (non-terminal) goals, not raw counts.pending.
			// Without this, starting a goal (pending -> active) would drop the
			// pending chip before done increments, making the HUD look stale.
			{ label: "pending", value: String(remainingGoalCount(status)), priority: 30 },
			...(status.currentGoal ? [{ label: "goal", value: status.currentGoal.id, priority: 5 }] : []),
		],
		updated_at: new Date().toISOString(),
	};
}
