import { getWorkflowSkillCommandNames } from "#workflows/skills/workflow-help-registry";
import type { WorkflowSkillSurface } from "#workflows/skills/workflow-surface-types";

const commandNames = getWorkflowSkillCommandNames("ralplan");

export const RALPLAN_SURFACE: WorkflowSkillSurface = {
	skill: "ralplan",
	commands: commandNames.map((commandName) => ({
		skill: "ralplan",
		commandName,
	})),
	tools: [
		{
			skill: "ralplan",
			toolName: "ralplan_run_agent",
			spawnOwner: "ralplan_run_agent",
			toolOwnerId: "ralplan_run_agent",
			guardedSpawn: true,
		},
	],
};
