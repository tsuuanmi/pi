import { Agent, type AgentOptions, type StreamFn } from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	type Model,
} from "@tsuuanmi/pi-ai";
import {
	createConsensusVerifier,
	Orchestrator,
	type OrchestratorCheckpoint,
	runConsensusVerification,
	Task,
	TaskQueue,
	Team,
} from "@tsuuanmi/pi-orchestrator";
import { describe, expect, it, vi } from "vitest";

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

class PlannerStream {
	readonly calls: string[] = [];
	private readonly output: string;

	constructor(output: string) {
		this.output = output;
	}

	readonly stream: StreamFn = (_model, context) => {
		const prompt = promptText(context.messages.at(-1)?.content);
		this.calls.push(prompt);
		return doneStream(assistantText(this.output));
	};
}

class JudgeStream {
	readonly calls: string[] = [];
	private readonly output: string;

	constructor(output: string) {
		this.output = output;
	}

	readonly stream: StreamFn = (_model, context) => {
		const prompt = promptText(context.messages.at(-1)?.content);
		this.calls.push(prompt);
		return doneStream(assistantText(this.output));
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

	it("plans strict task DAGs with an explicit coordinator", async () => {
		const planner = new PlannerStream(
			JSON.stringify([
				{
					id: "draft",
					title: "Draft",
					description: "Write draft",
					assignee: "writer",
					requires: ["write"],
					verify: { required: true },
				},
				{
					id: "review",
					title: "Review",
					description: "Review draft",
					assignee: "reviewer",
					dependsOn: ["draft"],
					requires: ["review"],
				},
			]),
		);
		const traces: string[] = [];
		const team = new Team({
			name: "builders",
			agents: [
				agentConfig("writer", new EchoStream(), ["write"]),
				agentConfig("reviewer", new EchoStream(), ["review"]),
			],
		});
		const coordinator = new Agent(agentConfig("coordinator", planner, ["plan"]));

		const plan = await new Orchestrator().plan(team, "Ship the article", {
			coordinator,
			onTrace: (event) => traces.push(event.type),
		});

		expect(plan.goal).toBe("Ship the article");
		expect(plan.tasks).toHaveLength(2);
		expect(plan.tasks[1]?.dependsOn).toEqual(["draft"]);
		expect(plan.tasks[0]?.verify).toEqual({ required: true });
		expect(planner.calls[0]).toContain("Roster:");
		expect(traces).toEqual(["plan_start", "plan_complete"]);
	});

	it("aborts planning when the abort signal is already set", async () => {
		const controller = new AbortController();
		controller.abort();
		const team = new Team({ name: "builders", agents: [agentConfig("writer", new EchoStream(), ["write"])] });
		const coordinator = new Agent(agentConfig("coordinator", new PlannerStream("[]"), ["plan"]));
		await expect(
			new Orchestrator().plan(team, "Plan", { coordinator, abortSignal: controller.signal }),
		).rejects.toThrow("Run aborted by abort signal.");
	});

	it("rejects malformed planner output", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("writer", new EchoStream(), ["write"])] });
		const coordinator = new Agent(agentConfig("coordinator", new PlannerStream("not-json"), ["plan"]));
		await expect(new Orchestrator().plan(team, "Plan", { coordinator })).rejects.toThrow(
			"Planner output must be valid JSON",
		);
	});

	it("rejects planner output with unknown assignees", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("writer", new EchoStream(), ["write"])] });
		const coordinator = new Agent(
			agentConfig(
				"coordinator",
				new PlannerStream(JSON.stringify([{ id: "a", title: "A", description: "A", assignee: "missing" }])),
				["plan"],
			),
		);
		await expect(new Orchestrator().plan(team, "Plan", { coordinator })).rejects.toThrow(
			'Planner task "a" uses unknown assignee: missing',
		);
	});

	it("rejects planner output with unknown dependencies", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("writer", new EchoStream(), ["write"])] });
		const coordinator = new Agent(
			agentConfig(
				"coordinator",
				new PlannerStream(JSON.stringify([{ id: "a", title: "A", description: "A", dependsOn: ["missing"] }])),
				["plan"],
			),
		);
		await expect(new Orchestrator().plan(team, "Plan", { coordinator })).rejects.toThrow(
			'Planner task "a" depends on unknown task id: missing',
		);
	});

	it("preserves exactly declared planner dependencies", async () => {
		const team = new Team({
			name: "builders",
			agents: [
				agentConfig("requirements", new EchoStream(), ["requirements"]),
				agentConfig("security", new EchoStream(), ["security"]),
				agentConfig("architect", new EchoStream(), ["architecture"]),
			],
		});
		const coordinator = new Agent(
			agentConfig(
				"coordinator",
				new PlannerStream(
					JSON.stringify([
						{ id: "requirements", title: "Requirements", description: "Gather", assignee: "requirements" },
						{
							id: "security",
							title: "Security",
							description: "Audit",
							assignee: "security",
							dependsOn: ["requirements"],
						},
						{
							id: "architecture",
							title: "Architecture",
							description: "Design",
							assignee: "architect",
							dependsOn: ["requirements"],
						},
					]),
				),
				["plan"],
			),
		);

		const plan = await new Orchestrator().plan(team, "Plan", { coordinator });

		expect(plan.tasks.find((task) => task.id === "architecture")?.dependsOn).toEqual(["requirements"]);
		expect(plan.tasks.find((task) => task.id === "architecture")?.dependsOn).not.toContain("security");
	});

	it("rejects cyclic planner dependencies", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("writer", new EchoStream(), ["write"])] });
		const coordinator = new Agent(
			agentConfig(
				"coordinator",
				new PlannerStream(
					JSON.stringify([
						{ id: "a", title: "A", description: "A", dependsOn: ["b"] },
						{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
					]),
				),
				["plan"],
			),
		);
		await expect(new Orchestrator().plan(team, "Plan", { coordinator })).rejects.toThrow(
			"Planner output contains cyclic dependencies: a -> b -> a",
		);
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
		const result = await new Orchestrator().run(team, [
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
		const orchestrator = new Orchestrator({ schedulingStrategy: "capability-match" });

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
			new Orchestrator().run(team, [
				{ id: "same", title: "One", description: "First" },
				{ id: "same", title: "Two", description: "Second" },
			]),
		).rejects.toThrow("Duplicate task id: same");
	});

	it("rejects missing dependencies and dependency cycles", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker")] });
		await expect(
			new Orchestrator().run(team, [{ id: "a", title: "A", description: "A", dependsOn: ["missing"] }]),
		).rejects.toThrow('Task "A" (a) references unknown dependency "missing".');
		await expect(
			new Orchestrator().run(team, [
				{ id: "a", title: "A", description: "A", dependsOn: ["b"] },
				{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
			]),
		).rejects.toThrow("Cyclic dependency detected");
	});

	it("fails unknown assignees and empty teams deterministically", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker")] });
		await expect(
			new Orchestrator().run(team, [{ id: "a", title: "A", description: "A", assignee: "missing" }]),
		).rejects.toThrow("Invalid task assignee(s): a -> missing");
		await expect(
			new Orchestrator().run(new Team({ name: "empty" }), [{ id: "a", title: "A", description: "A" }]),
		).rejects.toThrow("Cannot run a team without agents.");
	});

	it("blocks tasks whose prerequisites fail", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream({ fail: true }))] });
		const result = await new Orchestrator().run(team, [
			{ id: "a", title: "A", description: "A" },
			{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
		]);

		expect(result.success).toBe(false);
		expect(result.tasks.map((task) => task.status)).toEqual(["failed", "blocked"]);
	});

	it("honors concurrency overrides and keeps result order stable", async () => {
		const adapter = new EchoStream({ delayMs: 5 });
		const starts: string[] = [];
		const result = await new Orchestrator().run(
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
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
			[{ id: "a", title: "A", description: "A" }],
			{ abortSignal: controller.signal },
		);

		expect(result.status).toBe("aborted");
		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("skipped");
		expect(result.tasks[0]?.error).toBe("Run aborted by abort signal.");
	});

	it("enforces task-start budgets and emits budget events", async () => {
		const adapter = new EchoStream();
		const events: string[] = [];
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }),
			[
				{ id: "a", title: "A", description: "A" },
				{ id: "b", title: "B", description: "B" },
			],
			{
				maxConcurrency: 1,
				runBudget: { maxTaskStarts: 1 },
				onProgress: (event) => {
					if (event.type === "budget_exceeded") events.push(event.message ?? "");
				},
			},
		);

		expect(result.status).toBe("aborted");
		expect(result.success).toBe(false);
		expect(result.tasks.map((task) => task.status)).toEqual(["completed", "skipped"]);
		expect(events[0]).toContain("maxTaskStarts=1");
	});

	it("aborts in-flight tasks when maxRunMs is exceeded", async () => {
		const adapter = new EchoStream({ delayMs: 30 });
		const budgetEvents: string[] = [];
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }),
			[{ id: "a", title: "A", description: "A" }],
			{
				runBudget: { maxRunMs: 1 },
				onProgress: (event) => {
					if (event.type === "budget_exceeded") budgetEvents.push(event.message ?? "");
				},
			},
		);

		expect(result.status).toBe("aborted");
		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("skipped");
		expect(result.abortedReason).toBe("Run budget exceeded: maxRunMs=1.");
		expect(adapter.calls).toHaveLength(0);
		expect(budgetEvents).toEqual(["Run budget exceeded: maxRunMs=1."]);
	});

	it("fails tasks rejected by verification hooks", async () => {
		const events: string[] = [];
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
			[{ id: "a", title: "A", description: "A", verify: { required: true } }],
			{
				onTaskVerify: async () => false,
				onProgress: (event) => {
					if (event.type === "task_verify") events.push(event.message ?? "");
				},
			},
		);

		expect(result.status).toBe("completed");
		expect(result.success).toBe(false);
		expect(result.tasks[0]?.status).toBe("failed");
		expect(events[0]).toBe("Task verification failed.");
	});

	it("runs consensus verification with explicit judges", async () => {
		const context = {
			task: {
				id: "a",
				title: "A",
				description: "A",
				status: "completed" as const,
				dependsOn: [],
				requires: [],
				attempts: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				verify: { required: true },
			},
			team: new Team({ name: "builders", agents: [agentConfig("worker")] }),
			completedDependencies: [],
			attempt: 1,
			agent: "worker",
			output: "done",
		};
		const traces: string[] = [];
		const result = await runConsensusVerification(context, {
			judges: [
				new Agent(agentConfig("judge-a", new JudgeStream('{"approved":true,"reason":"good"}'))),
				new Agent(agentConfig("judge-b", new JudgeStream('{"approved":false,"reason":"weak"}'))),
				new Agent(agentConfig("judge-c", new JudgeStream('{"approved":true,"reason":"ok"}'))),
			],
			minApprovals: 2,
			onTrace: (event) => traces.push(event.type),
		});

		expect(result.approved).toBe(true);
		expect(result.approvals).toBe(2);
		expect(result.rejections).toBe(1);
		expect(result.votes.map((vote) => vote.reason)).toEqual(["good", "weak", "ok"]);
		expect(traces).toEqual([
			"consensus_start",
			"consensus_vote",
			"consensus_vote",
			"consensus_vote",
			"consensus_complete",
		]);
	});

	it("uses consensus verifier through onTaskVerify", async () => {
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
			[{ id: "a", title: "A", description: "A", verify: { required: true } }],
			{
				onTaskVerify: createConsensusVerifier({
					judges: [new Agent(agentConfig("judge", new JudgeStream('{"approved":true,"reason":"valid"}')))],
					minApprovals: 1,
				}),
			},
		);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.status).toBe("completed");
	});

	it("rejects invalid consensus options and malformed judge output", async () => {
		expect(() => createConsensusVerifier({ judges: [], minApprovals: 1 })).toThrow(
			"Consensus verification requires at least one judge.",
		);
		expect(() =>
			createConsensusVerifier({
				judges: [new Agent(agentConfig("judge", new JudgeStream('{"approved":true,"reason":"valid"}')))],
				minApprovals: 2,
			}),
		).toThrow("Consensus minApprovals must be an integer between 1 and 1.");
		const context = {
			task: {
				id: "a",
				title: "A",
				description: "A",
				status: "completed" as const,
				dependsOn: [],
				requires: [],
				attempts: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				verify: { required: true },
			},
			team: new Team({ name: "builders", agents: [agentConfig("worker")] }),
			completedDependencies: [],
			attempt: 1,
			agent: "worker",
			output: "done",
		};
		await expect(
			runConsensusVerification(context, {
				judges: [new Agent(agentConfig("judge", new JudgeStream("not-json")))],
				minApprovals: 1,
			}),
		).rejects.toThrow('Consensus judge "judge" returned invalid JSON');
	});

	it("emits trace events for run and task lifecycle", async () => {
		const traceTypes: string[] = [];
		const traceRunIds: string[] = [];
		const routingDecisions: unknown[] = [];
		const runIdentity = { runId: "trace-run", metadata: { purpose: "test" } };
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
			[{ id: "a", title: "A", description: "A", verify: { required: true } }],
			{
				checkpointStore: {
					load: () => undefined,
					save: async () => undefined,
				},
				runIdentity,
				onTaskVerify: async () => true,
				onTrace: (event) => {
					traceTypes.push(event.type);
					traceRunIds.push(event.runIdentity?.runId ?? "missing");
					if (event.type === "routing_decision") routingDecisions.push(event.data);
				},
			},
		);

		expect(result.success).toBe(true);
		expect(result.runIdentity).toEqual(runIdentity);
		expect(traceTypes).toEqual([
			"run_start",
			"checkpoint_save",
			"routing_decision",
			"task_start",
			"task_verify",
			"task_complete",
			"checkpoint_save",
			"checkpoint_save",
			"run_complete",
		]);
		expect(traceRunIds).toEqual(Array.from({ length: traceTypes.length }, () => "trace-run"));
		expect(routingDecisions).toEqual([
			{ taskId: "a", taskTitle: "A", agent: "worker", schedulingStrategy: "dependency-first" },
		]);
		expect(result.receipts.a).toMatchObject({
			receiptId: "trace-run:a",
			runId: "trace-run",
			taskId: "a",
			taskTitle: "A",
			agent: "worker",
			status: "completed",
			attempts: 1,
			routing: { taskId: "a", taskTitle: "A", agent: "worker", schedulingStrategy: "dependency-first" },
			retryCount: 0,
			verified: true,
		});
	});

	it("emits structured jittered retry decisions", async () => {
		const random = vi.spyOn(Math, "random").mockReturnValue(0.75);
		try {
			const traces: unknown[] = [];
			const result = await new Orchestrator().run(
				new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream({ fail: true }))] }),
				[{ id: "a", title: "A", description: "A", maxRetries: 1, retryDelayMs: 100, retryBackoff: 1 }],
				{
					onTaskRetryClassify: async () => "transient" as const,
					onTaskFailure: async (context) => (context.attempt === 1 ? "retry" : "fail"),
					onTrace: (event) => {
						if (event.type === "task_retry") traces.push(event.data);
					},
				},
			);

			expect(result.success).toBe(false);
			expect(traces).toEqual([
				{
					retryDecision: {
						attempt: 1,
						nextAttempt: 2,
						exponentialDelayMs: 100,
						jitterRatio: 0.2,
						jitterMs: 10,
						delayMs: 110,
					},
					retryClassification: "transient",
				},
			]);
			expect(result.receipts.a?.retryClassification).toBe("transient");
		} finally {
			random.mockRestore();
		}
	});

	it("halts consequential tasks without explicit approval", async () => {
		const traces: string[] = [];
		const stream = new EchoStream();
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", stream)] }),
			[{ id: "a", title: "A", description: "A", consequential: true }],
			{
				onTrace: (event) => traces.push(event.type),
			},
		);

		expect(result.status).toBe("aborted");
		expect(result.success).toBe(false);
		expect(result.abortedReason).toContain("Consequential task requires explicit approval");
		expect(result.tasks.map((task) => task.status)).toEqual(["skipped"]);
		expect(stream.calls).toHaveLength(0);
		expect(traces).toContain("task_consequential");
	});

	it("executes consequential tasks after explicit approval", async () => {
		const stream = new EchoStream();
		const approvals: string[] = [];
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", stream)] }),
			[{ id: "a", title: "A", description: "A", consequential: true }],
			{
				onTaskConsequential: async (task) => {
					approvals.push(task.id);
					return true;
				},
			},
		);

		expect(result.success).toBe(true);
		expect(approvals).toEqual(["a"]);
		expect(stream.calls).toHaveLength(1);
		expect(result.receipts.a?.consequential).toEqual({ required: true, approved: true });
	});

	it("aborts consequential tasks rejected by approval", async () => {
		const stream = new EchoStream();
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", stream)] }),
			[{ id: "a", title: "A", description: "A", consequential: true }],
			{ onTaskConsequential: async () => false },
		);

		expect(result.status).toBe("aborted");
		expect(result.abortedReason).toBe("Consequential task rejected: a");
		expect(result.tasks.map((task) => task.status)).toEqual(["skipped"]);
		expect(stream.calls).toHaveLength(0);
		expect(result.receipts.a?.consequential).toEqual({ required: true, approved: false });
	});

	it("aborts consequential tasks when approval throws", async () => {
		const errors: string[] = [];
		const stream = new EchoStream();
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", stream)] }),
			[{ id: "a", title: "A", description: "A", consequential: true }],
			{
				onTaskConsequential: async () => {
					throw new Error("approval unavailable");
				},
				onProgress: (event) => {
					if (event.type === "error") errors.push(event.message ?? "");
				},
			},
		);

		expect(result.status).toBe("aborted");
		expect(result.abortedReason).toBe("Consequential task approval failed: approval unavailable");
		expect(result.tasks.map((task) => task.status)).toEqual(["skipped"]);
		expect(stream.calls).toHaveLength(0);
		expect(errors).toEqual(["approval unavailable"]);
		expect(result.receipts.a?.consequential).toEqual({ required: true, approved: false });
	});

	it("short-circuits fatal failures with policy hooks", async () => {
		const traces: string[] = [];
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream({ fail: true }))] }),
			[
				{ id: "a", title: "A", description: "A", maxRetries: 3 },
				{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
			],
			{
				maxConcurrency: 1,
				onTaskFailure: async (context) => (context.attempt === 1 ? "abort" : "fail"),
				onTrace: (event) => traces.push(event.type),
			},
		);

		expect(result.status).toBe("aborted");
		expect(result.success).toBe(false);
		expect(result.tasks.map((task) => task.status)).toEqual(["failed", "skipped"]);
		expect(result.tasks[0]?.attempts).toBe(1);
		expect(traces).toContain("task_short_circuit");
	});

	it("rejects unsupported checkpoint versions", async () => {
		const team = new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] });
		await expect(
			new Orchestrator().run(team, [{ id: "a", title: "A", description: "A" }], {
				checkpointStore: {
					load: () => ({ version: 1 }),
					save: async () => undefined,
				} as never,
			}),
		).rejects.toThrow("Unsupported orchestrator checkpoint version: 1");
	});

	it("rejects v4 checkpoints missing required production fields", async () => {
		const queue = new TaskQueue();
		queue.add({ id: "a", title: "A", description: "A" });
		const base: OrchestratorCheckpoint = {
			version: 4,
			status: "running",
			runIdentity: { runId: "required-fields" },
			runFacts: {
				teamName: "builders",
				agentNames: ["worker"],
				taskIds: ["a"],
				startedAt: new Date().toISOString(),
			},
			tasks: queue.snapshot(),
			metrics: {},
			receipts: {},
			taskStarts: 0,
			updatedAt: new Date().toISOString(),
		};
		const team = new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] });
		await expect(
			new Orchestrator().run(team, [{ id: "a", title: "A", description: "A" }], {
				checkpointStore: { load: () => ({ ...base, runFacts: undefined }), save: async () => undefined } as never,
			}),
		).rejects.toThrow("Run facts must be an object");
		await expect(
			new Orchestrator().run(team, [{ id: "a", title: "A", description: "A" }], {
				checkpointStore: { load: () => ({ ...base, receipts: undefined }), save: async () => undefined } as never,
			}),
		).rejects.toThrow("Orchestrator checkpoint receipts must be an object");
	});

	it("resets interrupted checkpoint tasks before resuming", async () => {
		const adapter = new EchoStream();
		const queue = new TaskQueue();
		const task = queue.add({ id: "a", title: "A", description: "A" });
		task.assign("worker");
		task.start();
		let checkpoint: OrchestratorCheckpoint = {
			version: 4,
			status: "running",
			runIdentity: { runId: "resume-interrupted" },
			runFacts: {
				teamName: "builders",
				agentNames: ["worker"],
				taskIds: ["a"],
				startedAt: new Date().toISOString(),
			},
			tasks: queue.snapshot(),
			metrics: {},
			receipts: {},
			taskStarts: 1,
			updatedAt: new Date().toISOString(),
		};
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }),
			[{ id: "a", title: "A", description: "A" }],
			{
				checkpointStore: {
					load: () => checkpoint,
					save: async (value) => {
						checkpoint = value;
					},
				},
			},
		);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.status).toBe("completed");
		expect(result.tasks[0]?.attempts).toBe(2);
		expect(adapter.calls[0]).toContain("Task: A");
	});

	it("rejects checkpoint resume when run facts do not match", async () => {
		const queue = new TaskQueue();
		queue.add({ id: "a", title: "A", description: "A" });
		const checkpoint: OrchestratorCheckpoint = {
			version: 4,
			status: "running",
			runIdentity: { runId: "facts-mismatch" },
			runFacts: {
				teamName: "builders",
				agentNames: ["worker"],
				taskIds: ["a"],
				startedAt: new Date().toISOString(),
			},
			tasks: queue.snapshot(),
			metrics: {},
			receipts: {},
			taskStarts: 0,
			updatedAt: new Date().toISOString(),
		};

		await expect(
			new Orchestrator().run(
				new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
				[{ id: "b", title: "B", description: "B" }],
				{ checkpointStore: { load: () => checkpoint, save: async () => undefined } },
			),
		).rejects.toThrow("Checkpoint run facts task ids mismatch");
	});

	it("rejects checkpoint resume when agent roster does not match", async () => {
		const queue = new TaskQueue();
		queue.add({ id: "a", title: "A", description: "A" });
		const checkpoint: OrchestratorCheckpoint = {
			version: 4,
			status: "running",
			runIdentity: { runId: "roster-mismatch" },
			runFacts: {
				teamName: "builders",
				agentNames: ["worker", "reviewer"],
				taskIds: ["a"],
				startedAt: new Date().toISOString(),
			},
			tasks: queue.snapshot(),
			metrics: {},
			receipts: {},
			taskStarts: 0,
			updatedAt: new Date().toISOString(),
		};

		await expect(
			new Orchestrator().run(
				new Team({ name: "builders", agents: [agentConfig("worker", new EchoStream())] }),
				[{ id: "a", title: "A", description: "A" }],
				{ checkpointStore: { load: () => checkpoint, save: async () => undefined } },
			),
		).rejects.toThrow("Checkpoint run facts agent roster mismatch");
	});

	it("resumes from checkpoint snapshots", async () => {
		const adapter = new EchoStream();
		let checkpoint: OrchestratorCheckpoint | undefined;
		const store = {
			load: async () => checkpoint,
			save: async (value: typeof checkpoint) => {
				checkpoint = value;
			},
		};
		const team = new Team({ name: "builders", agents: [agentConfig("worker", adapter)] });
		const tasks = [
			{ id: "a", title: "A", description: "A" },
			{ id: "b", title: "B", description: "B", dependsOn: ["a"] },
		];

		await new Orchestrator().run(team, tasks, {
			maxConcurrency: 1,
			runBudget: { maxTaskStarts: 1 },
			checkpointStore: store,
		});
		expect(checkpoint?.status).toBe("aborted");
		expect(checkpoint?.tasks.tasks.map((task) => task.status)).toEqual(["completed", "skipped"]);
		const completedReceipt = checkpoint?.receipts.a;
		expect(completedReceipt).toMatchObject({ taskId: "a", status: "completed" });
		checkpoint = {
			...checkpoint!,
			status: "running",
			tasks: {
				...checkpoint!.tasks,
				tasks: checkpoint!.tasks.tasks.map((task) =>
					task.id === "b" ? { ...task, status: "pending", error: undefined } : task,
				),
				pending: ["b"],
				inProgress: [],
				completed: ["a"],
				failed: [],
				blocked: [],
				skipped: [],
			},
		};

		const resumed = await new Orchestrator().run(team, tasks, { maxConcurrency: 1, checkpointStore: store });
		expect(resumed.status).toBe("completed");
		expect(resumed.success).toBe(true);
		expect(adapter.calls).toHaveLength(2);
		expect(adapter.calls[0]).toContain("Task: A");
		expect(adapter.calls[1]).toContain("Task: B");
		expect(resumed.tasks.map((task) => task.status)).toEqual(["completed", "completed"]);
		expect(resumed.receipts.a).toEqual(completedReceipt);
		expect(resumed.receipts.b).toMatchObject({ taskId: "b", status: "completed" });
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

		await new Orchestrator().run(
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

	it("fails fast when no agent satisfies task requirements", async () => {
		await expect(
			new Orchestrator().run(
				new Team({
					name: "builders",
					agents: [agentConfig("writer", new EchoStream(), ["write"])],
				}),
				[{ id: "missing", title: "Deploy", description: "Deploy", requires: ["deploy"] }],
				{ schedulingStrategy: "composite" },
			),
		).rejects.toThrow('No eligible agent for task "Deploy" (missing); required capabilities: deploy.');
	});

	it("passes structured dependency payloads to dependent tasks", async () => {
		const adapter = new StructuredStream();
		const result = await new Orchestrator().run(
			new Team({ name: "builders", agents: [agentConfig("worker", adapter)] }),
			[
				{
					id: "produce",
					title: "Produce",
					description: "Produce structured output",
					dependencyPayload: "structured",
				},
				{ id: "consume", title: "Consume", description: "Consume structured output", dependsOn: ["produce"] },
			],
		);

		expect(result.success).toBe(true);
		expect(result.tasks[0]?.structured).toEqual({ value: 42 });
		expect(adapter.calls[1]).toContain('{"value":42}');
	});
});
