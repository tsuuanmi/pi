import type { HudSummary } from "@tsuuanmi/pi-tui";
import { progressChip } from "@tsuuanmi/pi-tui";
import type { TeamSnapshot } from "#workflows/skills/team/types";

/** Build the HUD summary for an active Team run. */
export function buildTeamHud(snapshot: TeamSnapshot): HudSummary {
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
