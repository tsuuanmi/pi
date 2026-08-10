import { describe, expect, it } from "vitest";
import type { WorkflowHost } from "#workflows/extension";
import workflowExtension from "#workflows/extension";
import { expectedNextRalplanRole } from "#workflows/policy/expected-next-role";

describe("workflow extension composition", () => {
	it("loads immutable skill policies without package-root side effects", () => {
		const tools: string[] = [];
		const hooks: string[] = [];
		const hudProviders: unknown[] = [];
		const host: WorkflowHost = {
			registerTool(tool) {
				tools.push(tool.name);
			},
			on(event) {
				hooks.push(event);
			},
			registerHudProvider(provider) {
				hudProviders.push(provider);
			},
		};

		workflowExtension(host);

		expect(tools).toContain("ralplan_run_agent");
		expect(hooks).toContain("tool_call");
		expect(hudProviders).toHaveLength(1);
		expect(
			expectedNextRalplanRole(
				{ explorerGate: { status: "passed" }, latest: { stage: "planner" } },
				"run-composition",
			),
		).toMatchObject({ stage: "architect", role: "architect", runId: "run-composition" });
	});
});
