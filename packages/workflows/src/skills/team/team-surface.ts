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
			toolName: "team_spawn_task_agent",
			spawnOwner: "team_spawn_task_agent",
			toolOwnerId: "team_spawn_task_agent",
			guardedSpawn: true,
		},
		{
			skill: "team",
			toolName: "team_spawn_review_agent",
			spawnOwner: "team_spawn_review_agent",
			toolOwnerId: "team_spawn_review_agent",
			guardedSpawn: true,
		},
		{
			skill: "team",
			toolName: "team_spawn_prover_agent",
			spawnOwner: "team_spawn_prover_agent",
			toolOwnerId: "team_spawn_prover_agent",
			guardedSpawn: true,
		},
	],
};
