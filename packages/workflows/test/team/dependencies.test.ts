import { describe, expect, it } from "vitest";
import { assertTeamDependencies, createRunnableTask, isTeamTaskReady } from "#workflows/skills/team/dependencies";
import type { TeamTask } from "#workflows/skills/team/types";

function task(id: string, status: TeamTask["status"] = "pending", dependsOn?: string[]): TeamTask {
	return {
		id,
		title: id,
		description: id,
		status,
		depends_on: dependsOn,
		version: 1,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
	};
}

describe("team task dependencies", () => {
	it("rejects unknown dependencies and cycles", () => {
		expect(() => assertTeamDependencies([task("a", "pending", ["missing"])])).toThrow(
			'references unknown dependency "missing"',
		);
		expect(() => assertTeamDependencies([task("a", "pending", ["b"]), task("b", "pending", ["a"])])).toThrow(
			"Cyclic dependency detected",
		);
	});

	it("admits tasks only after dependencies complete", () => {
		const pending = task("a");
		const dependent = task("b", "pending", ["a"]);
		expect(isTeamTaskReady(dependent, [pending, dependent])).toBe(false);
		expect(isTeamTaskReady(dependent, [task("a", "completed"), dependent])).toBe(true);
	});

	it("keeps explicitly blocked tasks out of execution", () => {
		const blocked = { ...task("a"), blocked_by: ["external-review"] };
		expect(isTeamTaskReady(blocked, [blocked])).toBe(false);
	});

	it("removes completed workflow dependencies from a single-task run", () => {
		const completed = task("a", "completed");
		const dependent = task("b", "pending", ["a"]);
		const runnable = createRunnableTask(dependent, [completed, dependent]);
		expect(runnable.depends_on).toBeUndefined();
		expect(dependent.depends_on).toEqual(["a"]);
	});
});
