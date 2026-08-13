import type { RalplanStage } from "#workflows/session/paths";

export type RalplanAgentRole = "explorer" | "planner" | "architect" | "critic" | "expert";

export function roleForStage(stage: RalplanStage): RalplanAgentRole {
	if (stage === "pre-planner") return "explorer";
	if (stage === "planner" || stage === "revision") return "planner";
	if (stage === "architect") return "architect";
	if (stage === "critic") return "critic";
	if (stage === "expert-stage") return "expert";
	throw new Error(`no ralplan role agent for stage: ${stage}`);
}
