import { DEEP_INTERVIEW_SURFACE } from "#workflows/skills/deep-interview/surface";
import { RALPLAN_SURFACE } from "#workflows/skills/ralplan/surface";
import { TEAM_SURFACE } from "#workflows/skills/team/surface";
import { ULTRAGOAL_SURFACE } from "#workflows/skills/ultragoal/surface";
import type { WorkflowSkillSurface, WorkflowToolSurface } from "#workflows/skills/workflow-surface-types";
import { SUBAGENT_SURFACES } from "#workflows/tool/surface";

export const WORKFLOW_SKILL_SURFACES: readonly WorkflowSkillSurface[] = [
	DEEP_INTERVIEW_SURFACE,
	RALPLAN_SURFACE,
	TEAM_SURFACE,
	ULTRAGOAL_SURFACE,
] as const;

export const WORKFLOW_TOOL_SURFACES: readonly WorkflowToolSurface[] = [
	...WORKFLOW_SKILL_SURFACES.flatMap((surface) => surface.tools),
	...SUBAGENT_SURFACES,
] as const;

export function validateWorkflowSurfaceRegistry(
	surfaces: readonly WorkflowSkillSurface[] = WORKFLOW_SKILL_SURFACES,
	toolSurfaces: readonly WorkflowToolSurface[] = WORKFLOW_TOOL_SURFACES,
): void {
	const seenToolNames = new Set<string>();
	for (const surface of surfaces) {
		for (const command of surface.commands) {
			if (!command.commandName.trim()) {
				throw new Error(`workflow command name must not be empty for skill: ${surface.skill}`);
			}
		}
	}
	for (const tool of toolSurfaces) {
		if (!tool.toolName.trim()) {
			throw new Error(`workflow toolName must not be empty for skill: ${tool.skill}`);
		}
		if (seenToolNames.has(tool.toolName)) {
			throw new Error(`duplicate workflow toolName registered: ${tool.toolName}`);
		}
		seenToolNames.add(tool.toolName);
	}
}
