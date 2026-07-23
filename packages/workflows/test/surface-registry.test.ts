import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import workflowsExtension from "#workflows/extensions/workflows";
import { PI_WORKFLOW_SKILLS } from "#workflows/registry/workflow-manifest";
import { getWorkflowSkillHelp, renderWorkflowCommandsReference } from "#workflows/skills/workflow-help-registry";
import {
	validateWorkflowSurfaceRegistry,
	WORKFLOW_SKILL_SURFACES,
	WORKFLOW_TOOL_SURFACES,
} from "#workflows/skills/workflow-surface-registry";

describe("workflow surface registry", () => {
	it("accepts repeated skill owners across multiple tool surfaces", () => {
		expect(() => validateWorkflowSurfaceRegistry()).not.toThrow();
	});

	it("rejects duplicate tool names", () => {
		expect(() =>
			validateWorkflowSurfaceRegistry(WORKFLOW_SKILL_SURFACES, [
				...WORKFLOW_TOOL_SURFACES,
				{ ...WORKFLOW_TOOL_SURFACES[0] },
			]),
		).toThrow(/duplicate workflow toolName registered/);
	});

	it("rejects duplicate guarded spawn owners", () => {
		expect(() =>
			validateWorkflowSurfaceRegistry(WORKFLOW_SKILL_SURFACES, [
				{
					skill: "team",
					toolName: "dup-a",
					spawnOwner: "team_spawn_task_agent",
					toolOwnerId: "team_spawn_task_agent",
					guardedSpawn: true,
				},
				{
					skill: "team",
					toolName: "dup-b",
					spawnOwner: "team_spawn_task_agent",
					toolOwnerId: "team_spawn_task_agent",
					guardedSpawn: true,
				},
			]),
		).toThrow(/duplicate guarded workflow spawnOwner registered/);
	});

	it("rejects unguarded owner metadata and guarded owner mismatches", () => {
		expect(() =>
			validateWorkflowSurfaceRegistry(WORKFLOW_SKILL_SURFACES, [
				{ skill: "team", toolName: "unguarded-owner", spawnOwner: "team_spawn_task_agent" },
			]),
		).toThrow(/unguarded workflow tool must not declare spawnOwner\/toolOwnerId/);
		expect(() =>
			validateWorkflowSurfaceRegistry(WORKFLOW_SKILL_SURFACES, [
				{
					skill: "team",
					toolName: "bad-owner",
					spawnOwner: "team_spawn_task_agent",
					toolOwnerId: "different_owner",
					guardedSpawn: true,
				},
			]),
		).toThrow(/guarded workflow spawnOwner\/toolOwnerId mismatch/);
	});

	it("keeps guarded spawn owners aligned with expected role owner ids", () => {
		const guardedOwners = WORKFLOW_TOOL_SURFACES.filter((tool) => tool.guardedSpawn).map((tool) => tool.spawnOwner);
		expect(guardedOwners.slice().sort()).toEqual(
			[
				"ralplan_run_agent",
				"team_spawn_prover_agent",
				"team_spawn_review_agent",
				"team_spawn_task_agent",
				"ultragoal_spawn_goal_agent",
			].sort(),
		);
		expect(
			WORKFLOW_TOOL_SURFACES.filter((tool) => tool.guardedSpawn).every(
				(tool) => tool.spawnOwner === tool.toolOwnerId,
			),
		).toBe(true);
	});

	it("validates command reference docs from skill help metadata", () => {
		const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
		for (const skill of PI_WORKFLOW_SKILLS) {
			const docPath = getWorkflowSkillHelp(skill).docs.find((doc) => doc.endsWith("/references/commands.md"));
			expect(docPath).toBeDefined();
			expect(readFileSync(resolve(repoRoot, docPath as string), "utf8")).toBe(
				renderWorkflowCommandsReference(skill),
			);
		}
	});

	it("registers the same tool names described by the surface registry", () => {
		const registeredTools: string[] = [];
		workflowsExtension({
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
			on() {},
		} as never);

		expect(registeredTools.slice().sort()).toEqual(WORKFLOW_TOOL_SURFACES.map((tool) => tool.toolName).sort());
	});
});
