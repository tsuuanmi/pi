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

class StructuredAdapter implements LlmAdapter {
	readonly calls: string[] = [];

	async complete(messages: readonly LlmMessage[]): Promise<LlmResponse> {
		const prompt = String(messages.at(-1)?.content ?? "");
		this.calls.push(prompt);
		return {
			content: "text-result",
			parts: [{ type: "text", text: "text-result" }],
			structured: { value: 42 } as never,
		};
	}
}

function agentConfig(name: string, adapter: LlmAdapter = new EchoAdapter(), capabilities: string[] = []): AgentConfig {
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

	it("pipelines newly unblocked tasks before unrelated long-running tasks finish", async () => {
		const timeline: string[] = [];
		class TimingAdapter implements LlmAdapter {
			async complete(messages: readonly LlmMessage[]): Promise<LlmResponse> {
				const prompt = String(messages.at(-1)?.content ?? "");
				const title = prompt.match(/# Task: (.*)/)?.[1] ?? "unknown";
				timeline.push(`start:${title}`);
				if (title === "Slow") await new Promise((resolve) => setTimeout(resolve, 30));
				timeline.push(`end:${title}`);
				return { content: title, parts: [{ type: "text", text: title }] };
			}
		}

		await runTeam(
			new Team("builders", [agentConfig("worker", new TimingAdapter())]),
			[
				{ id: "fast", title: "Fast", description: "Fast" },
				{ id: "slow", title: "Slow", description: "Slow" },
				{ id: "after-fast", title: "AfterFast", description: "After fast", dependsOn: ["fast"] },
			],
			{ maxConcurrency: 2 },
		);

		expect(timeline.indexOf("start:AfterFast")).toBeGreaterThan(timeline.indexOf("end:Fast"));
		expect(timeline.indexOf("start:AfterFast")).toBeLessThan(timeline.indexOf("end:Slow"));
	});

	it("uses composite scheduling with warnings for impossible requirements", async () => {
		const warnings: unknown[] = [];
		const writerAdapter = new EchoAdapter();
		const reviewerAdapter = new EchoAdapter();
		const result = await runTeam(
			new Team("builders", [
				agentConfig("writer", writerAdapter, ["write"]),
				agentConfig("reviewer", reviewerAdapter, ["review"]),
			]),
			[
				{ id: "review", title: "Review", description: "Review", requires: ["review"] },
				{ id: "missing", title: "Deploy", description: "Deploy", requires: ["deploy"] },
			],
			{ strategy: "composite", onWarning: (warning) => warnings.push(warning) },
		);

		expect(result.success).toBe(true);
		expect(result.tasks.find((task) => task.id === "review")?.assignee).toBe("reviewer");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({ code: "NO_ELIGIBLE_AGENT", taskId: "missing" });
	});

	it("passes structured dependency payloads to dependent tasks", async () => {
		const adapter = new StructuredAdapter();
		const result = await runTeam(new Team("builders", [agentConfig("worker", adapter)]), [
			{ id: "produce", title: "Produce", description: "Produce structured output", dependencyPayload: "structured" },
			{ id: "consume", title: "Consume", description: "Consume structured output", dependsOn: ["produce"] },
		]);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.structured).toEqual({ value: 42 });
		expect(adapter.calls[1]).toContain('{"value":42}');
	});
});
