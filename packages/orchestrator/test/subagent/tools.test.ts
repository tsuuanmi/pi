import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { describe, expect, it } from "vitest";
import { registerSubagentTools } from "#orchestrator/subagent/lifecycle-tools";
import { registerSubagentControls } from "#orchestrator/subagent/tools";

describe("orchestrator subagent lifecycle registration", () => {
	it("registers the seven lifecycle tools", () => {
		const names: string[] = [];
		const guidelines = new Map<string, string[]>();
		const host = {
			registerTool(tool: { name: string; promptGuidelines?: string[] }) {
				names.push(tool.name);
				if (tool.promptGuidelines) guidelines.set(tool.name, tool.promptGuidelines);
			},
		} as Pick<ExtensionAPI, "registerTool">;

		registerSubagentTools(host);

		expect(names).toEqual([
			"subagent_spawn",
			"subagent_status",
			"subagent_await",
			"subagent_steer",
			"subagent_pause",
			"subagent_resume",
			"subagent_cancel",
		]);
		expect(guidelines.size).toBe(7);
		expect(guidelines.get("subagent_resume")).toEqual([
			"Use subagent_resume when a previous persistent subagent should continue from its context.",
		]);
	});
});

describe("orchestrator subagent controls", () => {
	it("registers host-owned live controls", () => {
		const names: string[] = [];
		const host = {
			registerTool(tool: { name: string }) {
				names.push(tool.name);
			},
		} as Pick<ExtensionAPI, "registerTool">;

		registerSubagentControls(host);

		expect(names).toEqual(["subagent_inspect", "subagent_attach", "subagent_kill"]);
	});
});
