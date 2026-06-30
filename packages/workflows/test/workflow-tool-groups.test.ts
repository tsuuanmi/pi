import { describe, expect, it } from "vitest";
import {
	resolveWorkflowToolGroup,
	sameToolSet,
	selectWorkflowActiveTools,
	type WorkflowActiveState,
	WORKFLOW_OWNED_TOOLS,
} from "@tsuuanmi/pi-workflows";

function activeState(skill: "deep-interview" | "ralplan" | "team" | "ultragoal"): WorkflowActiveState {
	return {
		version: 1,
		active: true,
		updated_at: "2026-01-01T00:00:00.000Z",
		active_workflows: [
			{
				skill,
				active: true,
				phase: "running",
				updated_at: "2026-01-01T00:00:00.000Z",
			},
		],
	};
}

describe("workflow tool groups", () => {
	it("uses the current skill prompt before active workflow state", () => {
		const group = resolveWorkflowToolGroup({
			currentPromptText: '<skill name="ralplan" location="/tmp/SKILL.md">x</skill>',
			activeWorkflowState: activeState("ultragoal"),
		});

		expect(group).toBe("ralplan");
	});

	it("falls back to active workflow state", () => {
		expect(resolveWorkflowToolGroup({ activeWorkflowState: activeState("team") })).toBe("team");
	});

	it("selects no workflow-owned tools when no group is active", () => {
		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash", "ralplan_status", "fetch"],
		});

		expect(selected).toEqual(["read", "bash"]);
	});

	it("preserves non-workflow tools and replaces only workflow-owned tools", () => {
		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash", "ralplan_status", "team_start", "custom_tool"],
			selectedGroup: "ultragoal",
			availableToolNames: new Set([...WORKFLOW_OWNED_TOOLS, "read", "bash", "custom_tool"]),
		});

		expect(selected).toContain("read");
		expect(selected).toContain("bash");
		expect(selected).toContain("custom_tool");
		expect(selected).toContain("ultragoal_status");
		expect(selected).not.toContain("ralplan_status");
		expect(selected).not.toContain("team_start");
	});

	it("does not resurrect unavailable workflow tools", () => {
		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read"],
			selectedGroup: "ralplan",
			availableToolNames: new Set(["read", "ralplan_status"]),
		});

		expect(selected).toEqual(["read", "ralplan_status"]);
		expect(selected).not.toContain("ralplan_run_agent");
	});

	it("compares tool sets independently of order", () => {
		expect(sameToolSet(["bash", "read"], ["read", "bash"])).toBe(true);
		expect(sameToolSet(["bash", "read"], ["read"])).toBe(false);
	});
});
