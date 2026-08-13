import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { describe, expect, it } from "vitest";
import workflowExtension from "#workflows/extension";
import { PI_WORKFLOW_SKILLS } from "#workflows/registry/workflow-manifest";
import { getWorkflowSkillHelp, renderWorkflowCommandsReference } from "#workflows/skills/workflow-help-registry";
import {
	validateWorkflowSurfaceRegistry,
	WORKFLOW_SKILL_SURFACES,
	WORKFLOW_TOOL_SURFACES,
} from "#workflows/skills/workflow-surface-registry";
import { registerWorkflowTools } from "#workflows/tool/index";

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
		registerWorkflowTools({
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
		} as never);

		expect(registeredTools.slice().sort()).toEqual(
			WORKFLOW_TOOL_SURFACES.filter((tool) => tool.skill !== "subagent")
				.map((tool) => tool.toolName)
				.sort(),
		);
	});

	it("registers bundled workflow tools and hooks through one host entry point", () => {
		const registeredTools: string[] = [];
		const registeredHooks: string[] = [];
		const hudProviders: unknown[] = [];
		const host = {
			registerTool(tool: { name: string }) {
				registeredTools.push(tool.name);
			},
			on(event: string) {
				registeredHooks.push(event);
			},
			registerHudProvider(provider: unknown) {
				hudProviders.push(provider);
			},
		} as unknown as ExtensionAPI;
		workflowExtension(host);

		expect(registeredTools.slice().sort()).toEqual(WORKFLOW_TOOL_SURFACES.map((tool) => tool.toolName).sort());
		expect(hudProviders).toHaveLength(2);
		expect(registeredHooks).toEqual([
			"session_shutdown",
			"session_start",
			"turn_end",
			"tool_execution_end",
			"before_agent_start",
			"tool_result",
			"tool_call",
		]);
	});
});
