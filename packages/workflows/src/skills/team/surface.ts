import { getWorkflowSkillCommandNames } from "#workflows/skills/workflow-help-registry";
import type { WorkflowSkillSurface } from "#workflows/skills/workflow-surface-types";

const commandNames = getWorkflowSkillCommandNames("team");

export const TEAM_SURFACE: WorkflowSkillSurface = {
	skill: "team",
	commands: commandNames.map((commandName) => ({
		skill: "team",
		commandName,
	})),
	tools: [
		{
			skill: "team",
			toolName: "team_execute",
			description: "Execute the next team role through the orchestrator.",
		},
		{
			skill: "team",
			toolName: "team_resume",
			description: "Resume team execution through the orchestrator.",
		},
	],
};
