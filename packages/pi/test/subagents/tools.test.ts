import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "#pi/api/extension-types";
import { registerSubagentControls } from "#pi/subagents/tools";

describe("Pi subagent controls", () => {
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
