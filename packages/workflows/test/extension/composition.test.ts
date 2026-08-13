import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { describe, expect, it } from "vitest";
import workflowExtension from "#workflows/extension";
import { expectedNextRalplanRole } from "#workflows/policy/expected-next-role";

describe("workflow extension composition", () => {
	it("loads immutable skill policies without package-root side effects", () => {
		const tools: string[] = [];
		const hooks: string[] = [];
		const hudProviders: unknown[] = [];
		const host = {
			registerTool(tool: { name: string }) {
				tools.push(tool.name);
			},
			on(event: string) {
				hooks.push(event);
			},
			registerHudProvider(provider: unknown) {
				hudProviders.push(provider);
			},
		} as unknown as ExtensionAPI;

		workflowExtension(host);

		expect(tools).toContain("subagent_spawn");
		expect(hooks).toContain("tool_call");
		expect(hudProviders).toHaveLength(2);
		expect(
			expectedNextRalplanRole(
				{ explorerGate: { status: "passed" }, latest: { stage: "planner" } },
				"run-composition",
			),
		).toMatchObject({ stage: "architect", role: "architect", runId: "run-composition" });
	});
});
