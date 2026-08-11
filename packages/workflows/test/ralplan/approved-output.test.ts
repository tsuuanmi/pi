import { describe, expect, it } from "vitest";
import { adaptApprovedRalplanOutput } from "#workflows/skills/ralplan/approved-output";

const obstacle = {
	kind: "revision_required",
	status: "unresolved" as const,
	rationale: "Address the critic finding.",
};

describe("approved Ralplan output adapter", () => {
	it.each(["team", "ultragoal"] as const)("maps an approved plan to the %s workflow input", (target) => {
		const output = adaptApprovedRalplanOutput({
			target,
			planPath: "/tmp/approved-plan.md",
			runId: "run-1",
			carriedObstacles: [obstacle],
		});

		expect(output).toEqual({
			skill: target,
			patch: {
				input: "/tmp/approved-plan.md",
				source_workflow: "ralplan",
				source_run_id: "run-1",
				carried_obstacles: [obstacle],
			},
		});
		expect(output.patch.carried_obstacles?.[0]).not.toBe(obstacle);
	});
});
