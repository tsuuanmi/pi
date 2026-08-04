import type { WorkflowToolHost } from "@tsuuanmi/pi-workflows/tools/workflow-tools";
import { describe, expect, it } from "vitest";
import { registerSubagentControls } from "#pi/subagents/tools";

describe("Pi subagent controls", () => {
	it("registers host-owned live controls", () => {
		const names: string[] = [];
		const host = {
			registerTool(tool: { name: string }) {
				names.push(tool.name);
			},
		} as WorkflowToolHost;

		registerSubagentControls(host);

		expect(names).toEqual(["subagent_inspect", "subagent_attach", "subagent_kill"]);
	});
});
