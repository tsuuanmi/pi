import type { WorkflowSkill } from "#workflows/session/paths";

export type WorkflowSurfaceSkill = WorkflowSkill | "subagent";

export interface WorkflowCommandSurface {
	skill: WorkflowSkill;
	commandName: string;
	description?: string;
}

export interface WorkflowToolSurface {
	skill: WorkflowSurfaceSkill;
	toolName: string;
	description?: string;
	spawnOwner?: string;
	toolOwnerId?: string;
	guardedSpawn?: boolean;
}

export interface WorkflowSkillSurface {
	skill: WorkflowSkill;
	commands: readonly WorkflowCommandSurface[];
	tools: readonly WorkflowToolSurface[];
}
