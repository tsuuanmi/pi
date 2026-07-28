import { Agent, type AgentOptions, Orchestrator, runTeam, type StreamFn, Task, Team } from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	type Model,
} from "@tsuuanmi/pi-ai";
import { describe, expect, it } from "vitest";

const model: Model<"openai-completions"> = {
	id: "gpt-5",
	name: "GPT-5",
	api: "openai-completions",
	provider: "openai",
	baseUrl: "https://example.test/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 4096,
};

const usage = {
	input: 1,
	output: 1,
	totalTokens: 2,
	cacheRead: 0,
	cacheWrite: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function doneStream(message: AssistantMessage): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "start", partial: { ...message, content: [] } });
		stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
	});
	return stream;
}

function promptText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(part): part is { type: "text"; text: string } =>
					typeof part === "object" && part !== null && "type" in part && part.type === "text" && "text" in part,
			)
			.map((part) => part.text)
			.join("\n");
	}
	return JSON.stringify(content);
}

function assistantText(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "test",
		provider: "test",
		model: "test-model",
		usage,
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

class EchoStream {
	readonly calls: string[] = [];
	private readonly delayMs: number;
	private readonly fail: boolean;

	constructor(options: { delayMs?: number; fail?: boolean } = {}) {
		this.delayMs = options.delayMs ?? 0;
		this.fail = options.fail ?? false;
	}

	readonly stream: StreamFn = (_model, context, options) => {
		const content = promptText(context.messages.at(-1)?.content);
		const stream = createAssistantMessageEventStream();
		void (async () => {
			if (options?.signal?.aborted) {
				stream.push({
					type: "error",
					reason: "aborted",
					error: { ...assistantText(""), stopReason: "aborted", errorMessage: "aborted" },
				});
				return;
			}
			if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
			if (options?.signal?.aborted) {
				stream.push({
					type: "error",
					reason: "aborted",
					error: { ...assistantText(""), stopReason: "aborted", errorMessage: "aborted" },
				});
				return;
			}
			if (this.fail) {
				stream.push({
					type: "error",
					reason: "error",
					error: { ...assistantText(""), stopReason: "error", errorMessage: "adapter failed" },
				});
				return;
			}
			this.calls.push(content);
			const text = `done:${content.split("\n")[0]}`;
			stream.push({ type: "start", partial: { ...assistantText(text), content: [] } });
			stream.push({ type: "done", reason: "stop", message: assistantText(text) });
		})();
		return stream;
	};
}

class StructuredStream {
	readonly calls: string[] = [];

	readonly stream: StreamFn = (_model, context) => {
		const prompt = promptText(context.messages.at(-1)?.content);
		this.calls.push(prompt);
		return doneStream(assistantText('{"value":42}'));
	};
}

function agentConfig(
	name: string,
	stream: { stream: StreamFn } = new EchoStream(),
	capabilities: string[] = [],
): AgentOptions {
	return {
		name,
		capabilities,
		initialState: { model, systemPrompt: "Be direct.", tools: [] },
		streamFn: stream.stream,
		extractStructured: (output: string) => {
			try {
				return JSON.parse(output);
			} catch {
				return undefined;
			}
		},
	};
}

describe("multi-agent primitives", () => {
	it("runs an agent through an LLM adapter", async () => {
		const adapter = new EchoStream();
		const agent = new Agent(agentConfig("worker", adapter));

		const result = await agent.run("Build it");

		expect(result.success).toBe(true);
		expect(result.output).toBe("done:Build it");
		expect(adapter.calls).toEqual(["Build it"]);
	});

	it("routes team messages, tracks read state, and validates the roster", () => {
		const team = new Team({
			name: "builders",
			agents: [agentConfig("writer"), agentConfig("reviewer"), agentConfig("observer")],
		});
		const events: string[] = [];
		const received: string[] = [];
		team.on("message", (event) => events.push(`${event.type}:${event.agent}:${event.message.to}`));
		team.on("broadcast", (event) => events.push(`${event.type}:${event.agent}:${event.message.to}`));
		const unsubscribe = team.subscribe("reviewer", (message) => received.push(message.content));

		const direct = team.sendMessage("writer", "reviewer", "please review");
		const broadcast = team.broadcast("reviewer", "review complete");

		expect(events).toEqual(["message:writer:reviewer", "broadcast:reviewer:*"]);
		expect(received).toEqual(["please review"]);
		expect(team.getMessages("reviewer").map((message) => message.content)).toEqual(["please review"]);
		expect(team.getMessages("writer").map((message) => message.content)).toEqual(["review complete"]);
		expect(team.getMessages("observer").map((message) => message.content)).toEqual(["review complete"]);
		expect(team.getUnreadMessages("reviewer").map((message) => message.id)).toEqual([direct.id]);
		team.markMessagesRead("reviewer", [direct.id]);
		expect(team.getUnreadMessages("reviewer")).toEqual([]);
		expect(team.getConversation("writer", "reviewer").map((message) => message.content)).toEqual(["please review"]);

		const returned = team.getMessages("writer")[0]!;
		returned.timestamp.setUTCFullYear(2000);
		expect(team.getMessages("writer")[0]!.timestamp.getUTCFullYear()).not.toBe(2000);

		unsubscribe();
		team.sendMessage("writer", "reviewer", "second pass");
		expect(received).toEqual(["please review"]);

		const restored = new Team({
			name: "builders",
			agents: [agentConfig("writer"), agentConfig("reviewer"), agentConfig("observer")],
		});
		restored.restoreMessageBus(team.snapshotMessageBus());
		expect(restored.getMessages("reviewer").map((message) => message.content)).toEqual([
			"please review",
			"second pass",
		]);
		expect(() => team.sendMessage("writer", "missing", "nope")).toThrow("Unknown agent: missing");
		expect(() =>
			team.restoreMessageBus({
				version: 1,
				messages: [{ ...broadcast, from: "missing", timestamp: broadcast.timestamp.toISOString() }],
				readState: [],
			}),
		).toThrow("Unknown agent: missing");
	});

	it("executes dependency-ready tasks and injects dependency output", async () => {
		const adapter = new EchoStream();
		const team = new Team({ name: "builders", agents: [agentConfig("worker", adapter)] });
		const result = await runTeam(team, [
			new Task({ id: "plan", title: "Plan", description: "Plan the work" }),
			new Task({ id: "build", title: "Build", description: "Build from the plan", dependsOn: ["plan"] }),
		]);

		expect(result.success).toBe(true);
		expect(result.tasks.map((task) => task.status)).toEqual(["completed", "completed"]);
		expect(adapter.calls[1]).toContain("Completed dependencies");
		expect(adapter.calls[1]).toContain("done:Task: Plan");
	});

	it("assigns capability-matched tasks to matching agents", async () => {
		const writerAdapter = new EchoStream();
		const reviewerAdapter = new EchoStream();
		const team = new Team({
			name: "review",
			agents: [
				agentConfig("writer", writerAdapter, ["write"]),
				agentConfig("reviewer", reviewerAdapter, ["review"]),
			],
		});
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
		const team = new Team({ name: "builders", agents: [agentConfig("worker")] });

		await expect(
			runTeam(team, [
				{ id: "same", title: "One", description: "First" },
				{ id: "same", title: "Two", description: "Second" },
			]),
		).rejects.toThrow("Task already exists: same");
	});

	it("blocks missing dependencies and dependency cycles", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker")] });
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
		const team = new Team({ name: "builders", agents: [agentConfig("worker")] });
		const result = await runTeam(team, [{ id: "a", title: "A", description: "A", assignee: "missing" }]);
		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("failed");
		expect(result.tasks[0]?.error).toBe("Unknown assignee: missing");
		await expect(runTeam(new Team({ name: "empty" }), [{ id: "a", title: "A", description: "A" }])).rejects.toThrow(
			"Cannot run a team without agents.",
		);
	});

	it("blocks tasks whose prerequisites fail", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream({ fail: true }))] });
		const result = await runTeam(team, [
			{ id: "a", title: "A", description: "A" },
			{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
		]);

		expect(result.success).toBe(false);
		expect(result.tasks.map((task) => task.status)).toEqual(["failed", "blocked"]);
	});

	it("honors concurrency overrides and keeps result order stable", async () => {
		const adapter = new EchoStream({ delayMs: 5 });
		const starts: string[] = [];
		const result = await runTeam(
			new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }),
			[
				{ id: "a", title: "A", description: "A" },
				{ id: "b", title: "B", description: "B" },
				{ id: "c", title: "C", description: "C" },
			],
			{ maxConcurrency: 1, onTaskStart: (task) => starts.push(task.id) },
		);

		expect(starts).toEqual(["a", "b", "c"]);
		expect(result.tasks.map((task) => task.id)).toEqual(["a", "b", "c"]);
		expect(result.output).toContain("done:Task: A");
	});

	it("propagates abort signals to agents", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await runTeam(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
			[{ id: "a", title: "A", description: "A" }],
			{ signal: controller.signal },
		);

		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("failed");
		expect(result.tasks[0]?.error).toBe("aborted");
	});

	it("serializes overlapping task prompts for the same agent instance", async () => {
		const timeline: string[] = [];
		class TimingStream {
			readonly stream: StreamFn = (_model, context) => {
				const prompt = promptText(context.messages.at(-1)?.content);
				const title = prompt.match(/Task: (.*)/)?.[1] ?? "unknown";
				const stream = createAssistantMessageEventStream();
				void (async () => {
					timeline.push(`start:${title}`);
					if (title === "Slow") await new Promise((resolve) => setTimeout(resolve, 30));
					timeline.push(`end:${title}`);
					stream.push({ type: "start", partial: { ...assistantText(title), content: [] } });
					stream.push({ type: "done", reason: "stop", message: assistantText(title) });
				})();
				return stream;
			};
		}

		await runTeam(
			new Team({ name: "builders", agents: [agentConfig("worker", new TimingStream())] }),
			[
				{ id: "fast", title: "Fast", description: "Fast" },
				{ id: "slow", title: "Slow", description: "Slow" },
				{ id: "after-fast", title: "AfterFast", description: "After fast", dependsOn: ["fast"] },
			],
			{ maxConcurrency: 2 },
		);

		expect(timeline.indexOf("start:AfterFast")).toBeGreaterThan(timeline.indexOf("end:Fast"));
		expect(timeline.indexOf("start:AfterFast")).toBeGreaterThan(timeline.indexOf("end:Slow"));
	});

	it("uses composite scheduling with warnings for impossible requirements", async () => {
		const warnings: unknown[] = [];
		const writerAdapter = new EchoStream();
		const reviewerAdapter = new EchoStream();
		const result = await runTeam(
			new Team({
				name: "builders",
				agents: [
					agentConfig("writer", writerAdapter, ["write"]),
					agentConfig("reviewer", reviewerAdapter, ["review"]),
				],
			}),
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
		const adapter = new StructuredStream();
		const result = await runTeam(new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }), [
			{ id: "produce", title: "Produce", description: "Produce structured output", dependencyPayload: "structured" },
			{ id: "consume", title: "Consume", description: "Consume structured output", dependsOn: ["produce"] },
		]);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.structured).toEqual({ value: 42 });
		expect(adapter.calls[1]).toContain('{"value":42}');
	});
});
