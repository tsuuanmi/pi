import type { WorkflowSkill } from "#workflows/session/paths";
import { DEEP_INTERVIEW_SURFACE } from "#workflows/skills/deep-interview/deep-interview-surface";
import { RALPLAN_SURFACE } from "#workflows/skills/ralplan/ralplan-surface";
import { TEAM_SURFACE } from "#workflows/skills/team/team-surface";
import { ULTRAGOAL_SURFACE } from "#workflows/skills/ultragoal/ultragoal-surface";
import type { WorkflowSkillSurface, WorkflowToolSurface } from "#workflows/skills/workflow-surface-types";
import { SUBAGENT_TOOLS } from "#workflows/subagents/subagent-surface";

export const WORKFLOW_SKILL_SURFACES: readonly WorkflowSkillSurface[] = [
	DEEP_INTERVIEW_SURFACE,
	RALPLAN_SURFACE,
	TEAM_SURFACE,
	ULTRAGOAL_SURFACE,
] as const;

export const WORKFLOW_TOOL_SURFACES: readonly WorkflowToolSurface[] = [
	...WORKFLOW_SKILL_SURFACES.flatMap((surface) => surface.tools),
	...SUBAGENT_TOOLS,
] as const;

export function getWorkflowSkillSurface(skill: WorkflowSkill): WorkflowSkillSurface {
	const surface = WORKFLOW_SKILL_SURFACES.find((item) => item.skill === skill);
	if (!surface) throw new Error(`missing workflow surface metadata for skill: ${skill}`);
	return surface;
}

export function getWorkflowSkillCommandNames(skill: WorkflowSkill): readonly string[] {
	return getWorkflowSkillSurface(skill).commands.map((command) => command.commandName);
}

export function getWorkflowToolNames(): readonly string[] {
	return WORKFLOW_TOOL_SURFACES.map((tool) => tool.toolName);
}

export function validateWorkflowSurfaceRegistry(
	surfaces: readonly WorkflowSkillSurface[] = WORKFLOW_SKILL_SURFACES,
	toolSurfaces: readonly WorkflowToolSurface[] = WORKFLOW_TOOL_SURFACES,
): void {
	const seenToolNames = new Set<string>();
	const seenGuardedSpawnOwners = new Set<string>();
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
		if (!tool.guardedSpawn) {
			if (tool.spawnOwner || tool.toolOwnerId) {
				throw new Error(`unguarded workflow tool must not declare spawnOwner/toolOwnerId: ${tool.toolName}`);
			}
			continue;
		}
		if (!tool.spawnOwner) {
			throw new Error(`guarded workflow tool is missing spawnOwner: ${tool.toolName}`);
		}
		if (!tool.toolOwnerId) {
			throw new Error(`guarded workflow tool is missing toolOwnerId: ${tool.toolName}`);
		}
		if (tool.toolOwnerId !== tool.spawnOwner) {
			throw new Error(`guarded workflow spawnOwner/toolOwnerId mismatch: ${tool.toolName}`);
		}
		if (seenGuardedSpawnOwners.has(tool.spawnOwner)) {
			throw new Error(`duplicate guarded workflow spawnOwner registered: ${tool.spawnOwner}`);
		}
		seenGuardedSpawnOwners.add(tool.spawnOwner);
	}
}
