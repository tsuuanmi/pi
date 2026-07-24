import { Agent, type AgentConfig, Orchestrator, runTeam, Task, Team } from "@tsuuanmi/pi-agent";
import type { LlmAdapter, LlmMessage, LlmResponse } from "@tsuuanmi/pi-ai";
import { describe, expect, it } from "vitest";

class EchoAdapter implements LlmAdapter {
	readonly calls: string[] = [];
	private readonly delayMs: number;
	private readonly fail: boolean;

	constructor(options: { delayMs?: number; fail?: boolean } = {}) {
		this.delayMs = options.delayMs ?? 0;
		this.fail = options.fail ?? false;
	}

	async complete(messages: readonly LlmMessage[], options?: { signal?: AbortSignal }): Promise<LlmResponse> {
		if (options?.signal?.aborted) throw new Error("aborted");
		if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
		if (options?.signal?.aborted) throw new Error("aborted");
		if (this.fail) throw new Error("adapter failed");
		const prompt = messages.at(-1)?.content;
		const content = typeof prompt === "string" ? prompt : JSON.stringify(prompt);
		this.calls.push(content);
		return {
			content: `done:${content.split("\n")[0]}`,
			parts: [{ type: "text", text: `done:${content.split("\n")[0]}` }],
		};
	}
}

function agentConfig(name: string, adapter = new EchoAdapter(), capabilities: string[] = []): AgentConfig {
	return { name, adapter, capabilities };
}

describe("multi-agent primitives", () => {
	it("runs an agent through an LLM adapter", async () => {
		const adapter = new EchoAdapter();
		const agent = new Agent({ name: "worker", instructions: "Be direct.", adapter });

		const result = await agent.run("Build it");

		expect(result.success).toBe(true);
		expect(result.output).toBe("done:Build it");
		expect(adapter.calls).toEqual(["Build it"]);
	});

	it("executes dependency-ready tasks and injects dependency output", async () => {
		const adapter = new EchoAdapter();
		const team = new Team("builders", [agentConfig("worker", adapter)]);
		const result = await runTeam(team, [
			new Task({ id: "plan", title: "Plan", description: "Plan the work" }),
			new Task({ id: "build", title: "Build", description: "Build from the plan", dependsOn: ["plan"] }),
		]);

		expect(result.success).toBe(true);
		expect(result.tasks.map((task) => task.status)).toEqual(["completed", "completed"]);
		expect(adapter.calls[1]).toContain("# Completed dependencies");
		expect(adapter.calls[1]).toContain("done:# Task: Plan");
	});

	it("assigns capability-matched tasks to matching agents", async () => {
		const writerAdapter = new EchoAdapter();
		const reviewerAdapter = new EchoAdapter();
		const team = new Team("review", [
			agentConfig("writer", writerAdapter, ["write"]),
			agentConfig("reviewer", reviewerAdapter, ["review"]),
		]);
		const orchestrator = new Orchestrator({ strategy: "capability-match" });

		const result = await orchestrator.run(team, [
			{ id: "review-task", title: "Review", description: "Review output", requires: ["review"] },
		]);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.assignee).toBe("reviewer");
		expect(writerAdapter.calls).toEqual([]);
		expect(reviewerAdapter.calls).toHaveLength(1);
	});

	it("rejects duplicate task ids", async () => {
		const team = new Team("builders", [agentConfig("worker")]);

		await expect(
			runTeam(team, [
				{ id: "same", title: "One", description: "First" },
				{ id: "same", title: "Two", description: "Second" },
			]),
		).rejects.toThrow("Task already exists: same");
	});

	it("blocks missing dependencies and dependency cycles", async () => {
		const team = new Team("builders", [agentConfig("worker")]);
		const missing = await runTeam(team, [{ id: "a", title: "A", description: "A", dependsOn: ["missing"] }]);
		const cycle = await runTeam(team, [
			{ id: "a", title: "A", description: "A", dependsOn: ["b"] },
			{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
		]);

		expect(missing.success).toBe(false);
		expect(missing.tasks[0]?.status).toBe("blocked");
		expect(cycle.success).toBe(false);
		expect(cycle.tasks.map((task) => task.status)).toEqual(["blocked", "blocked"]);
	});

	it("fails unknown assignees and empty teams deterministically", async () => {
		const team = new Team("builders", [agentConfig("worker")]);
		const result = await runTeam(team, [{ id: "a", title: "A", description: "A", assignee: "missing" }]);
		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("failed");
		expect(result.tasks[0]?.error).toBe("Unknown assignee: missing");
		await expect(runTeam(new Team("empty"), [{ id: "a", title: "A", description: "A" }])).rejects.toThrow(
			"Cannot run a team without agents.",
		);
	});

	it("blocks tasks whose prerequisites fail", async () => {
		const team = new Team("builders", [agentConfig("worker", new EchoAdapter({ fail: true }))]);
		const result = await runTeam(team, [
			{ id: "a", title: "A", description: "A" },
			{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
		]);

		expect(result.success).toBe(false);
		expect(result.tasks.map((task) => task.status)).toEqual(["failed", "blocked"]);
	});

	it("honors concurrency overrides and keeps result order stable", async () => {
		const adapter = new EchoAdapter({ delayMs: 5 });
		const starts: string[] = [];
		const result = await runTeam(
			new Team("builders", [agentConfig("worker", adapter)]),
			[
				{ id: "a", title: "A", description: "A" },
				{ id: "b", title: "B", description: "B" },
				{ id: "c", title: "C", description: "C" },
			],
			{ maxConcurrency: 1, onTaskStart: (task) => starts.push(task.id) },
		);

		expect(starts).toEqual(["a", "b", "c"]);
		expect(result.tasks.map((task) => task.id)).toEqual(["a", "b", "c"]);
		expect(result.output).toContain("done:# Task: A");
	});

	it("propagates abort signals to agents", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await runTeam(
			new Team("builders", [agentConfig("worker", new EchoAdapter())]),
			[{ id: "a", title: "A", description: "A" }],
			{ signal: controller.signal },
		);

		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("failed");
		expect(result.tasks[0]?.error).toBe("aborted");
	});
});
