import type { ObstacleInput } from "#workflows/audit/decision-ledger";
import type { HandoffSidePatch } from "#workflows/handoff/handoff";
import type { RalplanApprovalTarget } from "#workflows/skills/ralplan/types";

export type RalplanExecutionTarget = Exclude<RalplanApprovalTarget, "stop">;

export interface ApprovedRalplanOutputInput {
	target: RalplanExecutionTarget;
	planPath: string;
	runId: string;
	carriedObstacles: readonly ObstacleInput[];
}

/** Map an approved Ralplan artifact to the canonical downstream workflow input. */
export function adaptApprovedRalplanOutput(input: ApprovedRalplanOutputInput): HandoffSidePatch {
	return {
		skill: input.target,
		patch: {
			input: input.planPath,
			source_workflow: "ralplan",
			source_run_id: input.runId,
			carried_obstacles: input.carriedObstacles.map((obstacle) => ({ ...obstacle })),
		},
	};
}
