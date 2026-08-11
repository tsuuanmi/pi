import { type HudSummary, hudChip, progressChip } from "@tsuuanmi/pi-tui";
import type { UltragoalStatus } from "#workflows/skills/ultragoal/types";

/** Remaining goals across every non-terminal status. */
function remainingGoalCount(status: UltragoalStatus): number {
	return (
		status.counts.pending +
		status.counts.active +
		status.counts.failed +
		status.counts.blocked +
		status.counts.review_blocked
	);
}

/** Build the HUD summary for an active Ultragoal run. */
export function buildUltragoalHud(status: UltragoalStatus): HudSummary {
	return {
		version: 1,
		summary: status.currentGoal ? `${status.currentGoal.id}: ${status.currentGoal.title}` : status.status,
		chips: [
			progressChip(status.counts.complete, status.goals.length, 15),
			...(status.lastCheckpoint ? [hudChip("restore", "state-only", 40, "info")] : []),
			...(status.counts.review_blocked > 0 ? [hudChip("ship", "caveats:review-blocked", 45, "warning")] : []),
			...(status.counts.blocked + status.counts.review_blocked > 0
				? [hudChip("limitations", status.counts.blocked + status.counts.review_blocked, 50, "info")]
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
