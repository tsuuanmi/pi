import type { RalplanStatus } from "#workflows/harness/ralplan/ralplan-runtime";
import { escalationToExpertChip, progressChip } from "#workflows/harness/shared/hud/hud-chips";
import type { WorkflowHudSummary } from "#workflows/harness/shared/state/active-state";

/**
 * Build the workflow HUD summary for an active ralplan run.
 *
 * Extracted mechanically from `ralplan-runtime.ts` (behavior-preserving): the
 * `RalplanStatus` type is imported type-only, so there is no runtime import
 * cycle. `new Date().toISOString()` is inlined (matching the original).
 */
export function buildRalplanHud(status: RalplanStatus): WorkflowHudSummary {
	const stage =
		status.latest?.stage ??
		(typeof status.state?.current_phase === "string" ? status.state.current_phase : undefined);
	return {
		version: 1,
		summary: status.latest ? `persisted ${status.latest.stage} stage ${status.latest.stage_n}` : undefined,
		chips: [
			...(status.state?.expert_escalation === true || status.state?.current_phase === "expert-stage"
				? [escalationToExpertChip()]
				: []),
			...(status.iteration ? [progressChip(status.iteration, Number(status.state?.iterate_cap ?? 5), 25)] : []),
			...(status.pending_approval
				? [{ label: "pending", value: "approval", priority: 5, severity: "warning" as const }]
				: []),
			...(stage ? [{ label: "stage", value: stage, priority: 10 }] : []),
			...(status.iteration ? [{ label: "iter", value: String(status.iteration), priority: 30 }] : []),
			...(Object.keys(status.stages).length > 0
				? [
						{
							label: "stages",
							value: Object.entries(status.stages)
								.map(([key, value]) => `${key}:${value}`)
								.join(","),
							priority: 35,
						},
					]
				: []),
		],
		updated_at: new Date().toISOString(),
	};
}
