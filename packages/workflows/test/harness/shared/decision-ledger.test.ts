import { type ObstacleInput, type ObstacleValidator, validateObstacles } from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

/**
 * Direct unit tests for the shared integrity wall (`validateObstacles`). The
 * deep-interview integration test (`deep-interview-workflow.test.ts`) covers the
 * adapter end-to-end; these lock the skill-agnostic contract the ralplan and
 * ultragoal migrations will rely on.
 */

const noOpValidator: ObstacleValidator<unknown> = {
	validateActive: () => [],
};

describe("validateObstacles — rationale gate", () => {
	it("rejects disputed obstacles without a rationale", () => {
		const result = validateObstacles([{ kind: "A", status: "disputed" }], noOpValidator, undefined, {
			priorPresent: true,
		});
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual([{ code: "missing_rationale", kind: "A", status: "disputed" }]);
	});

	it("rejects unresolved obstacles without a rationale", () => {
		const result = validateObstacles([{ kind: "B", status: "unresolved" }], noOpValidator, undefined, {
			priorPresent: true,
		});
		expect(result.ok).toBe(false);
		expect(result.violations[0]).toMatchObject({ code: "missing_rationale", kind: "B", status: "unresolved" });
	});

	it("accepts disputed/unresolved obstacles that carry a rationale (regardless of prior)", () => {
		const result = validateObstacles(
			[
				{ kind: "A", status: "disputed", rationale: "user later reversed this constraint" },
				{ kind: "B", status: "unresolved", rationale: "moved on without resolving" },
			],
			noOpValidator,
			undefined,
			{ priorPresent: false },
		);
		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("accepts resolved obstacles unconditionally", () => {
		const result = validateObstacles([{ kind: "A", status: "resolved" }], noOpValidator, undefined, {
			priorPresent: false,
		});
		expect(result.ok).toBe(true);
	});
});

describe("validateObstacles — regression wall (needsRegression defaults true)", () => {
	it("skips active obstacles entirely when priorPresent is false", () => {
		const result = validateObstacles(
			[
				{
					kind: "A",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.5, newValue: 0.3, direction: "rise" },
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: false },
		);
		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("flags active obstacles with no regression as missing metrics", () => {
		const result = validateObstacles([{ kind: "A", status: "active" }], noOpValidator, undefined, {
			priorPresent: true,
		});
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual([{ code: "missing_regression_metrics", kind: "A" }]);
	});

	it("flags a rise-direction regression that did not actually rise", () => {
		const result = validateObstacles(
			[
				{
					kind: "A",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.4, newValue: 0.3, direction: "rise" },
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(result.ok).toBe(false);
		expect(result.violations[0]).toMatchObject({
			code: "no_regression",
			kind: "A",
			metric: "ambiguity",
			priorValue: 0.4,
			newValue: 0.3,
			direction: "rise",
		});
	});

	it("accepts a proved rise regression", () => {
		const result = validateObstacles(
			[
				{
					kind: "A",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.3, newValue: 0.5, direction: "rise" },
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(result.ok).toBe(true);
	});

	it("accepts an unchanged-weak regression when the value did not improve", () => {
		const ok = validateObstacles(
			[
				{
					kind: "C",
					status: "active",
					regression: {
						metric: "clarity:constraints",
						priorValue: 0.4,
						newValue: 0.4,
						direction: "unchanged-weak",
					},
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(ok.ok).toBe(true);
		const fell = validateObstacles(
			[
				{
					kind: "C",
					status: "active",
					regression: {
						metric: "clarity:constraints",
						priorValue: 0.4,
						newValue: 0.3,
						direction: "unchanged-weak",
					},
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(fell.ok).toBe(true);
		const improved = validateObstacles(
			[
				{
					kind: "C",
					status: "active",
					regression: {
						metric: "clarity:constraints",
						priorValue: 0.4,
						newValue: 0.5,
						direction: "unchanged-weak",
					},
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(improved.ok).toBe(false);
		expect(improved.violations[0]).toMatchObject({ code: "no_regression", kind: "C" });
	});

	it("accepts a proved fall regression", () => {
		const result = validateObstacles(
			[
				{
					kind: "D",
					status: "active",
					regression: { metric: "coverage", priorValue: 0.8, newValue: 0.6, direction: "fall" },
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true },
		);
		expect(result.ok).toBe(true);
	});
});

describe("validateObstacles — skill validator", () => {
	it("invokes the skill validator only for active obstacles when priorPresent is true", () => {
		const seen: ObstacleInput[] = [];
		const validator: ObstacleValidator<unknown> = {
			validateActive: (obstacle) => {
				seen.push(obstacle);
				return [{ code: "skill_check", kind: obstacle.kind }];
			},
		};
		const result = validateObstacles(
			[
				{ kind: "A", status: "disputed", rationale: "ok" },
				{
					kind: "A",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.3, newValue: 0.5, direction: "rise" },
				},
			],
			validator,
			undefined,
			{ priorPresent: true },
		);
		expect(seen.map((o) => o.status)).toEqual(["active"]);
		expect(result.violations).toContainEqual({ code: "skill_check", kind: "A" });
	});

	it("does not invoke the skill validator when priorPresent is false", () => {
		let called = 0;
		const validator: ObstacleValidator<unknown> = {
			validateActive: () => {
				called++;
				return [];
			},
		};
		validateObstacles(
			[
				{
					kind: "A",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.3, newValue: 0.5, direction: "rise" },
				},
			],
			validator,
			undefined,
			{ priorPresent: false },
		);
		expect(called).toBe(0);
	});

	it("runs the skill validator even when regression metrics are missing", () => {
		const validator: ObstacleValidator<unknown> = {
			validateActive: (o) => [{ code: "skill_check", kind: o.kind }],
		};
		const result = validateObstacles([{ kind: "A", status: "active" }], validator, undefined, { priorPresent: true });
		expect(result.violations.map((v) => v.code)).toEqual(["missing_regression_metrics", "skill_check"]);
	});
});

describe("validateObstacles — registry-aware regression skip (Phase R-0)", () => {
	const registry = {
		plan_rejected: { label: "critic rejected the plan", needsRegression: false },
		ambiguity_rise: { label: "ambiguity rose", needsRegression: true },
	};
	const validator: ObstacleValidator<unknown> = {
		validateActive: (o) => (o.scope?.planRef ? [] : [{ code: "missing_artifact_ref", kind: o.kind }]),
	};

	it("skips the regression requirement for needsRegression:false kinds", () => {
		const result = validateObstacles(
			[{ kind: "plan_rejected", status: "active", scope: { planRef: "ralplan/planner/001" } }],
			validator,
			undefined,
			{ priorPresent: true, registry },
		);
		expect(result.ok).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it("still runs the skill validator for needsRegression:false kinds", () => {
		const result = validateObstacles([{ kind: "plan_rejected", status: "active" }], validator, undefined, {
			priorPresent: true,
			registry,
		});
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual([{ code: "missing_artifact_ref", kind: "plan_rejected" }]);
	});

	it("still enforces regression for needsRegression:true kinds when a registry is supplied", () => {
		const noRise = validateObstacles(
			[
				{
					kind: "ambiguity_rise",
					status: "active",
					regression: { metric: "ambiguity", priorValue: 0.4, newValue: 0.3, direction: "rise" },
				},
			],
			noOpValidator,
			undefined,
			{ priorPresent: true, registry },
		);
		expect(noRise.ok).toBe(false);
		expect(noRise.violations[0]).toMatchObject({ code: "no_regression", kind: "ambiguity_rise" });

		const noMetrics = validateObstacles([{ kind: "ambiguity_rise", status: "active" }], noOpValidator, undefined, {
			priorPresent: true,
			registry,
		});
		expect(noMetrics.violations[0]).toMatchObject({ code: "missing_regression_metrics", kind: "ambiguity_rise" });
	});

	it("defaults to needsRegression:true for unknown kinds, preserving Phase A behavior", () => {
		const result = validateObstacles([{ kind: "A", status: "active" }], noOpValidator, undefined, {
			priorPresent: true,
			registry,
		});
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual([{ code: "missing_regression_metrics", kind: "A" }]);
	});
});
