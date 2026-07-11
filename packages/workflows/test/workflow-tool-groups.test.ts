import {
	resolveActiveWorkflowSkills,
	sameToolSet,
	selectWorkflowActiveTools,
	WORKFLOW_OWNED_TOOLS,
	WORKFLOW_SKILL_TOOLS,
	type WorkflowActiveState,
} from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

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

/** An active entry that has gone idle (stale) — e.g. a workflow resumed after 30 min. */
function staleActiveState(skill: "deep-interview" | "ralplan" | "team" | "ultragoal"): WorkflowActiveState {
	return {
		version: 1,
		active: true,
		updated_at: "2025-01-01T00:00:00.000Z",
		active_workflows: [
			{
				skill,
				active: true,
				phase: "running",
				updated_at: "2025-01-01T00:00:00.000Z",
				stale: true,
			},
		],
	};
}

describe("workflow tool groups", () => {
	it("includes both the prompt-invoked skill and active workflow skills", () => {
		const skills = resolveActiveWorkflowSkills({
			currentPromptText: '<skill name="ralplan" location="/tmp/SKILL.md">x</skill>',
			activeWorkflowState: activeState("ultragoal"),
		});

		expect(skills).toEqual(expect.arrayContaining(["ralplan", "ultragoal"]));
	});

	it("falls back to active workflow state when no skill is invoked this turn", () => {
		expect(resolveActiveWorkflowSkills({ activeWorkflowState: activeState("team") })).toEqual(["team"]);
	});

	it("keeps tools for a stale-but-active workflow so it can be resumed", () => {
		// A workflow idle for >30 min is stale; its tools must stay available to resume.
		const skills = resolveActiveWorkflowSkills({ activeWorkflowState: staleActiveState("ultragoal") });
		expect(skills).toEqual(["ultragoal"]);

		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash", "ultragoal_create_plan"],
			selectedSkills: skills,
		});
		expect(selected).toContain("ultragoal_create_plan");
	});

	it("unions tools for multiple concurrently active skills", () => {
		const multi: WorkflowActiveState = {
			version: 1,
			active: true,
			updated_at: "2026-01-01T00:00:00.000Z",
			active_workflows: [
				{ skill: "team", active: true, phase: "running", updated_at: "2026-01-01T00:00:00.000Z" },
				{ skill: "ultragoal", active: true, phase: "running", updated_at: "2026-01-01T00:00:00.000Z" },
			],
		};

		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash"],
			selectedSkills: resolveActiveWorkflowSkills({ activeWorkflowState: multi }),
			availableToolNames: new Set([...WORKFLOW_OWNED_TOOLS, "read", "bash"]),
		});

		expect(selected).toContain("team_start");
		expect(selected).toContain("ultragoal_create_plan");
	});

	it("excludes skills that have handed off (inactive entries)", () => {
		const handedOff: WorkflowActiveState = {
			version: 1,
			active: true,
			updated_at: "2026-01-01T00:00:00.000Z",
			active_workflows: [
				{ skill: "deep-interview", active: false, phase: "handed-off", updated_at: "2026-01-01T00:00:00.000Z" },
				{ skill: "ralplan", active: true, phase: "planner", updated_at: "2026-01-01T00:01:00.000Z" },
			],
		};

		const skills = resolveActiveWorkflowSkills({ activeWorkflowState: handedOff });
		expect(skills).toEqual(["ralplan"]);
	});

	it("prunes only workflow-skill tools when no skill is in play (keeps cross-cutting tools)", () => {
		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash", "ralplan_status", "pi_workflow_state", "subagent_spawn", "fetch"],
		});

		// skill-specific tools are pruned; cross-cutting tools stay available
		expect(selected).not.toContain("ralplan_status");
		expect(selected).toEqual(["read", "bash", "pi_workflow_state", "subagent_spawn", "fetch"]);
	});

	it("preserves non-workflow tools and replaces only workflow-owned tools", () => {
		const selected = selectWorkflowActiveTools({
			currentActiveTools: ["read", "bash", "ralplan_status", "team_start", "custom_tool"],
			selectedSkills: ["ultragoal"],
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
			selectedSkills: ["ralplan"],
			availableToolNames: new Set(["read", "ralplan_status"]),
		});

		expect(selected).toEqual(["read", "ralplan_status"]);
		expect(selected).not.toContain("ralplan_run_agent");
	});

	it("ignores unknown skill names injected via the prompt tag", () => {
		const skills = resolveActiveWorkflowSkills({
			currentPromptText: '<skill name="not-a-real-skill" location="/tmp/SKILL.md">x</skill>',
		});
		expect(skills).toEqual([]);
	});

	it("compares tool sets independently of order", () => {
		expect(sameToolSet(["bash", "read"], ["read", "bash"])).toBe(true);
		expect(sameToolSet(["bash", "read"], ["read"])).toBe(false);
	});

	it("exposes a tool set for every workflow skill", () => {
		for (const skill of ["deep-interview", "ralplan", "team", "ultragoal"] as const) {
			expect(WORKFLOW_SKILL_TOOLS[skill].length).toBeGreaterThan(0);
		}
	});
});
