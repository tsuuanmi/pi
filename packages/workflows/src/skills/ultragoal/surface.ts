import { getWorkflowSkillCommandNames } from "#workflows/skills/workflow-help-registry";
import type { WorkflowSkillSurface } from "#workflows/skills/workflow-surface-types";

const commandNames = getWorkflowSkillCommandNames("ultragoal");

export const ULTRAGOAL_SURFACE: WorkflowSkillSurface = {
	skill: "ultragoal",
	commands: commandNames.map((commandName) => ({
		skill: "ultragoal",
		commandName,
	})),
	tools: [
		{
			skill: "ultragoal",
			toolName: "ultragoal_spawn_goal_agent",
			spawnOwner: "ultragoal_spawn_goal_agent",
			toolOwnerId: "ultragoal_spawn_goal_agent",
			guardedSpawn: true,
		},
	],
};
