import { progressChip } from "#workflows/harness/shared/hud/hud-chips";
import type { WorkflowHudSummary } from "#workflows/harness/shared/state/active-state";
import type { TeamSnapshot } from "#workflows/harness/team/team-runtime";

/**
 * Build the workflow HUD summary for an active team run.
 *
 * Extracted mechanically from `team-runtime.ts` (behavior-preserving): the
 * `TeamSnapshot` type is imported type-only, so there is no runtime import
 * cycle. `new Date().toISOString()` is inlined (matching the original
 * `nowIso()`).
 */
export function buildTeamHud(snapshot: TeamSnapshot): WorkflowHudSummary {
	return {
		version: 1,
		summary: snapshot.team_id ? `${snapshot.task_total} tasks` : "missing",
		chips: [
			progressChip(snapshot.task_counts.completed, snapshot.task_total, 15),
			{
				label: "phase",
				value: snapshot.phase,
				priority: 10,
				severity: snapshot.phase === "failed" ? "error" : snapshot.phase === "complete" ? "success" : undefined,
			},
			{ label: "done", value: String(snapshot.task_counts.completed), priority: 20 },
			{ label: "active", value: String(snapshot.task_counts.in_progress), priority: 30 },
			{
				label: "blocked",
				value: String(snapshot.task_counts.blocked),
				priority: 40,
				severity: snapshot.task_counts.blocked > 0 ? "warning" : undefined,
			},
		],
		updated_at: new Date().toISOString(),
	};
}
