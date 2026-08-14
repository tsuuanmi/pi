import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";

export type WorkflowSurfaceSkill = WorkflowSkill | "researcher" | "subagent";

export interface WorkflowCommandSurface {
	skill: WorkflowSkill;
	commandName: string;
	description?: string;
}

export interface WorkflowToolSurface {
	skill: WorkflowSurfaceSkill;
	toolName: string;
	description?: string;
}

export interface WorkflowSkillSurface {
	skill: WorkflowSkill;
	commands: readonly WorkflowCommandSurface[];
	tools: readonly WorkflowToolSurface[];
}
