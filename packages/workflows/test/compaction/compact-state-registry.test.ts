import {
	type CompactBudget,
	hasCompactSchema,
	projectCompactStateFor,
	type RalplanStatus,
	registerCompactSchema,
	resetCompactSchemaRegistry,
} from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

describe("compact-state registry", () => {
	it("registers a compact schema for each workflow skill on import", () => {
		expect(hasCompactSchema("deep-interview")).toBe(true);
		expect(hasCompactSchema("ralplan")).toBe(true);
		expect(hasCompactSchema("ultragoal")).toBe(true);
		expect(hasCompactSchema("team")).toBe(true);
	});

	it("fails closed when no schema is registered for a skill", () => {
		resetCompactSchemaRegistry();
		expect(() => projectCompactStateFor("ralplan", {})).toThrow(/no compact schema registered/);
	});

	it("supports registering a new skill without core changes (no shape lock-in)", () => {
		// registry was reset above; register a custom projection and dispatch it.
		registerCompactSchema("team", {
			project: (input: unknown, budget?: CompactBudget) => ({ echo: input, lastN: budget?.lastN }),
		});
		expect(projectCompactStateFor("team", { x: 1 }, { lastN: 7 })).toEqual({ echo: { x: 1 }, lastN: 7 });
	});

	it("projects ralplan status deterministically (same input -> same compact)", () => {
		// restore the eager registrations for the remaining skill assertions
		registerCompactSchema("ralplan", {
			project: (input: unknown) => {
				const status = input as RalplanStatus;
				return {
					run_id: status.run_id,
					phase: typeof status.state?.current_phase === "string" ? status.state.current_phase : undefined,
					iteration: status.iteration,
					stages: status.stages,
					latest: status.latest
						? {
								stage: status.latest.stage,
								stage_n: status.latest.stage_n,
								path: status.latest.path,
								created_at: status.latest.created_at,
							}
						: undefined,
					pending_approval: status.pending_approval,
					pending_approval_path: status.pending_approval_path,
					invalid_index_line_count: status.invalid_index_lines.length,
				};
			},
		});
		const status: RalplanStatus = {
			state_path: "/x/state.json",
			state: { current_phase: "critic" },
			rows: [],
			invalid_index_lines: [],
			iteration: 2,
			stages: { planner: 1, critic: 2 },
			latest: { stage: "critic", stage_n: 2, path: "stage-02-critic.md", sha256: "abc", created_at: "t" },
			pending_approval: false,
		};
		const first = projectCompactStateFor("ralplan", status);
		const second = projectCompactStateFor("ralplan", status);
		expect(second).toEqual(first);
		expect(first).toMatchObject({
			phase: "critic",
			iteration: 2,
			pending_approval: false,
			invalid_index_line_count: 0,
			stages: { planner: 1, critic: 2 },
		});
	});
});
