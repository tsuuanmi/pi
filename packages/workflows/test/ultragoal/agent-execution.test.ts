import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertUltragoalSubagentSpawn } from "#workflows/skills/ultragoal/agent-execution";
import { createUltragoalPlan, startNextUltragoalGoal } from "#workflows/skills/ultragoal/plan";

const sessionId = "ultragoal-agent-session";

describe("ultragoal agent execution policy", () => {
	let cwd: string;
	let goalId: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-ultragoal-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		await createUltragoalPlan(cwd, { brief: "Implement one approved task with verification evidence." }, sessionId);
		const started = await startNextUltragoalGoal(cwd, false, sessionId);
		goalId = started.goal!.id;
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("admits the active goal with the worker profile", async () => {
		await expect(
			assertUltragoalSubagentSpawn(
				{
					agent: "worker",
					role: "worker",
					systemPrompt: "Execute only the active Ultragoal task and report evidence.",
					metadata: {
						workflow: "ultragoal",
						owner: "ultragoal",
						stage: "goal-worker",
						role: "worker",
						taskId: goalId,
					},
				},
				cwd,
				sessionId,
			),
		).resolves.toBe(true);
	});

	it("rejects off-script goals and runtime overrides", async () => {
		await expect(
			assertUltragoalSubagentSpawn(
				{
					agent: "worker",
					role: "worker",
					model: "provider/model",
					systemPrompt: "Execute the goal.",
					metadata: {
						workflow: "ultragoal",
						owner: "ultragoal",
						stage: "goal-worker",
						role: "worker",
						taskId: "wrong-goal",
					},
				},
				cwd,
				sessionId,
			),
		).rejects.toThrow(/off-script spawn refused: task wrong-goal/);
	});
});
