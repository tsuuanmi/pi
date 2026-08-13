import { assertExpectedNextRole, assertNoGuardedSpawnOverrides, nextRoleForSkill } from "@tsuuanmi/pi-workflows";
import { describe, expect, it } from "vitest";

describe("expected-next-role policy", () => {
	it("routes ralplan through the deterministic policy", () => {
		const expected = nextRoleForSkill({
			skill: "ralplan",
			runId: "run-registry",
			state: { explorerGate: { status: "passed" }, latest: { stage: "planner" } },
		});
		expect(expected).toMatchObject({ skill: "ralplan", stage: "architect", role: "architect" });
		assertExpectedNextRole(expected!, {
			skill: "ralplan",
			stage: "architect",
			role: "architect",
			owner: "ralplan",
			runId: "run-registry",
		});
	});

	it("routes team through the deterministic policy", () => {
		const expected = nextRoleForSkill({
			skill: "team",
			state: {
				team_id: "team-registry",
				tasks: [
					{ id: "task-b", status: "pending" },
					{ id: "task-a", status: "pending" },
				],
			},
		});
		expect(expected).toMatchObject({ skill: "team", taskId: "task-a", role: "worker" });
	});

	it("routes ultragoal active goals through the deterministic policy", () => {
		const expected = nextRoleForSkill({
			skill: "ultragoal",
			state: { current_goal_id: "G001", goals: [{ id: "G001", status: "active" }] },
		});
		expect(expected).toMatchObject({
			skill: "ultragoal",
			stage: "goal-worker",
			role: "worker",
			owner: "ultragoal",
			taskId: "G001",
		});
	});

	it("keeps guarded spawns override-free", () => {
		expect(() => assertNoGuardedSpawnOverrides({ model: "frontier/x", thinkingLevel: "high" })).toThrow(
			/runtime overrides.*model.*thinkingLevel/,
		);
	});
});
