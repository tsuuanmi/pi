import {
	Agent,
	type AgentEvent,
	type AgentTool,
	createToolRegistry,
	defineTool,
	LoopDetector,
	normalizeLoopDetectionOptions,
	parseStructuredOutput,
} from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	type Model,
} from "@tsuuanmi/pi-ai";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";

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

function assistantToolCall(
	content = [{ type: "toolCall" as const, id: "call-1", name: "repeat", arguments: { value: "same" } }],
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "test",
		provider: "test",
		model: "test-model",
		usage,
		stopReason: "toolUse",
		timestamp: Date.now(),
	};
}

function repeatTool(name = "repeat", execute?: AgentTool["execute"]): AgentTool {
	return {
		name,
		description: name,
		label: name,
		parameters: Type.Object({ value: Type.String() }),
		execute: execute ?? (async () => ({ content: [{ type: "text", text: "same" }], details: {} })),
	};
}

function doneStream(message: AssistantMessage): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "start", partial: { ...message, content: [] } });
		stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
	});
	return stream;
}

function pendingStream(message: AssistantMessage): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "start", partial: { ...message, content: [] } });
	});
	return {
		[Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
		push: stream.push.bind(stream),
		result: () => new Promise<AssistantMessage>(() => {}),
	} as AssistantMessageEventStream;
}

describe("agent reliability helpers", () => {
	test("detects repeated tool-call loops when configured", async () => {
		const events: string[] = [];
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: "test",
				tools: [repeatTool()],
			},
			streamFn: () => doneStream(assistantToolCall()),
			loopDetection: { maxRepeats: 2, action: "stop" },
		});
		agent.subscribe((event: AgentEvent) => {
			events.push(event.type);
		});

		await agent.prompt("start");

		expect(events.filter((event) => event === "turn_end")).toHaveLength(2);
		expect(events).toContain("loop_detected");
		expect(events.at(-1)).toBe("agent_end");
	});

	test("validates structured JSON against a TypeBox schema", () => {
		const schema = Type.Object({ answer: Type.String(), count: Type.Number() });
		const result = parseStructuredOutput('```json\n{"answer":"ok","count":2}\n```', schema);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({ answer: "ok", count: 2 });
		}
	});

	test("promptStructured returns validated model output", async () => {
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText('{"answer":"ok"}')),
		});
		const events: string[] = [];
		agent.subscribe((event: AgentEvent) => {
			events.push(event.type);
		});

		const result = await agent.promptStructured("answer", { schema: Type.Object({ answer: Type.String() }) });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.answer).toBe("ok");
		}
		expect(events).toContain("structured_output");
	});

	test("runs registered lifecycle hooks in isolated runs", async () => {
		const phases: string[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText("done")),
		});
		const hook = {
			name: "lifecycle",
			beforeRun: async () => {
				phases.push("before");
			},
			afterRun: async () => {
				phases.push("after");
			},
		};
		const removeHook = agent.registerHook(hook);
		expect(() => agent.registerHook(hook)).toThrow("already registered");

		const result = await agent.run("start");

		removeHook();
		agent.registerHook(hook);

		expect(result.success).toBe(true);
		expect(phases).toEqual(["before", "after"]);
	});

	test("normalizes loop detection windows and tool-call order", () => {
		const options = normalizeLoopDetectionOptions({ maxRepeats: 3, windowSize: 1 });
		expect(options?.windowSize).toBe(3);
		expect(options).toBeDefined();
		if (!options) throw new Error("Loop detection options were not normalized");
		const detector = new LoopDetector(options);
		const left = assistantToolCall([
			{ type: "toolCall", id: "call-1", name: "first", arguments: { value: "same" } },
			{ type: "toolCall", id: "call-2", name: "second", arguments: { value: "same" } },
		]);
		const right = assistantToolCall([
			{ type: "toolCall", id: "call-2", name: "second", arguments: { value: "same" } },
			{ type: "toolCall", id: "call-1", name: "first", arguments: { value: "same" } },
		]);

		detector.record({ message: left, toolResults: [], newMessages: [] });
		detector.record({ message: right, toolResults: [], newMessages: [] });
		const result = detector.record({ message: left, toolResults: [], newMessages: [] });

		expect(result?.detected).toBe(true);
	});

	test("defines tools with required declaration fields", () => {
		const tool = repeatTool("defined");

		expect(defineTool(tool)).toBe(tool);
		expect(createToolRegistry([defineTool(tool)]).has("defined")).toBe(true);
		expect(() => defineTool({ ...repeatTool(), name: " " })).toThrow("Tool name is required");
		expect(() => defineTool({ ...repeatTool(), description: "" })).toThrow("Tool description is required");
		expect(() => defineTool({ ...repeatTool(), label: "\t" })).toThrow("Tool label is required");
	});

	test("rejects duplicate tool registration", () => {
		const registry = createToolRegistry([repeatTool()]);

		expect(() => registry.register(repeatTool())).toThrow('Tool "repeat" is already registered');

		registry.replace(repeatTool());
		expect(registry.list()).toHaveLength(1);
	});

	test("dispose is terminal and idempotent", async () => {
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => doneStream(assistantText("done")),
		});

		const first = agent.dispose();
		const second = agent.dispose();

		await expect(first).resolves.toBeUndefined();
		await expect(second).resolves.toBeUndefined();
		expect(() => agent.reset()).toThrow("Agent has been disposed");
		await expect(agent.prompt("start")).rejects.toThrow("Agent has been disposed");
		await expect(agent.run("start")).rejects.toThrow("Agent has been disposed");
		await expect(agent.continue()).rejects.toThrow("Agent has been disposed");
		expect(() => agent.steer(assistantText("queued"))).toThrow("Agent has been disposed");
		expect(() => agent.followUp(assistantText("queued"))).toThrow("Agent has been disposed");
		expect(() => agent.clearAllQueues()).toThrow("Agent has been disposed");
	});

	test("dispose settles active prompt and run work", async () => {
		const promptAgent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => pendingStream(assistantText("done")),
		});

		const promptPromise = promptAgent.prompt("start");
		await Promise.resolve();
		const promptDispose = promptAgent.dispose();
		await expect(promptPromise).resolves.toBeUndefined();
		await expect(promptDispose).resolves.toBeUndefined();
		expect(promptAgent.state.isStreaming).toBe(false);

		const runAgent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			streamFn: () => pendingStream(assistantText("done")),
		});

		const runPromise = runAgent.run("start");
		await Promise.resolve();
		await runAgent.dispose();
		await expect(runPromise).resolves.toMatchObject({ success: false });
	});

	test("uses deterministic runtime timestamps and request ids", async () => {
		const starts: string[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			now: () => 123_456,
			createRequestId: (sequence, startedAt) => `request-${sequence}-${startedAt}`,
			providerRequestObserver: {
				onRequestStart: ({ requestId }) => {
					starts.push(requestId);
				},
			},
			streamFn: () => doneStream(assistantText("done")),
		});

		await agent.prompt("start");

		expect(starts).toHaveLength(1);
		expect(starts[0]).toMatch(/^request-\d+-123456$/);
		expect(agent.state.messages[0]?.timestamp).toBe(123_456);
	});

	test("limits tool output with per-tool precedence", async () => {
		let streamCalls = 0;
		const results: string[] = [];
		const meta: AgentEvent[] = [];
		const limitedTool = repeatTool("limited", async () => ({
			content: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }],
			details: {},
		}));
		limitedTool.maxOutputChars = 5;
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [limitedTool] },
			maxToolOutputChars: 10,
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "limited", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "message_end" && event.message.role === "toolResult") {
				const text = event.message.content.find((content) => content.type === "text")?.text;
				if (text) results.push(text);
			}
			if (event.type === "tool_execution_end") {
				meta.push(event);
			}
		});

		await agent.prompt("start");

		expect(results).toEqual(["abcde\n[tool output truncated: kept 5 of 26 chars]"]);
		expect(meta).toHaveLength(1);
		expect(meta[0]?.type).toBe("tool_execution_end");
		if (meta[0]?.type !== "tool_execution_end") throw new Error("Tool execution metadata was not emitted");
		expect(meta[0].meta).toEqual(
			expect.objectContaining({
				status: "completed",
				truncated: true,
				originalChars: 26,
				emittedChars: 49,
				span: expect.objectContaining({
					kind: "tool",
					status: "ok",
					name: "limited",
				}),
			}),
		);
	});

	test("validates tool result details when schema is declared", async () => {
		let streamCalls = 0;
		const results: Array<{ isError: boolean; text: string; status: string }> = [];
		const tool = repeatTool("validated", async () => ({
			content: [{ type: "text", text: "ok" }],
			details: { count: 1 },
		}));
		tool.detailsSchema = Type.Object({ count: Type.Number() });
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "validated", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "tool_execution_end") {
				const text = event.result.content.find(
					(content: { type: string; text?: string }) => content.type === "text",
				)?.text;
				results.push({ isError: event.isError, text: text ?? "", status: event.meta.status });
			}
		});

		await agent.prompt("start");

		expect(results).toEqual([{ isError: false, text: "ok", status: "completed" }]);
	});

	test("fails tool calls with invalid declared details", async () => {
		let streamCalls = 0;
		const results: Array<{ isError: boolean; text: string; status: string }> = [];
		const tool = repeatTool("invalid", async () => ({
			content: [{ type: "text", text: "bad" }],
			details: { count: "one" },
		}));
		tool.detailsSchema = Type.Object({ count: Type.Number() });
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "invalid", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "tool_execution_end") {
				const text = event.result.content.find(
					(content: { type: string; text?: string }) => content.type === "text",
				)?.text;
				results.push({ isError: event.isError, text: text ?? "", status: event.meta.status });
			}
		});

		await agent.prompt("start");

		expect(results).toHaveLength(1);
		expect(results[0]?.isError).toBe(true);
		expect(results[0]?.status).toBe("failed");
		expect(results[0]?.text).toContain("Tool invalid returned invalid details");
	});

	test("validates details replaced by afterToolCall", async () => {
		let streamCalls = 0;
		const statuses: string[] = [];
		const tool = repeatTool("after-invalid", async () => ({
			content: [{ type: "text", text: "ok" }],
			details: { count: 1 },
		}));
		tool.detailsSchema = Type.Object({ count: Type.Number() });
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			hooks: [
				{
					name: "invalid-details",
					afterToolCall: async () => ({ details: { count: "one" } }),
				},
			],
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "after-invalid", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "tool_execution_end") {
				statuses.push(event.meta.status);
			}
		});

		await agent.prompt("start");

		expect(statuses).toEqual(["failed"]);
	});

	test("emits blocked and failed tool execution metadata", async () => {
		let streamCalls = 0;
		const meta: AgentEvent[] = [];
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: "test",
				tools: [
					repeatTool("failing", async () => {
						throw new Error("tool failed");
					}),
				],
			},
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "missing", arguments: { value: "same" } },
								{ type: "toolCall", id: "call-2", name: "failing", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "tool_execution_end") {
				meta.push(event);
			}
		});

		await agent.prompt("start");

		expect(meta).toHaveLength(2);
		const statuses = meta.map((event) => {
			if (event.type !== "tool_execution_end") throw new Error("Unexpected event");
			return event.meta.status;
		});
		expect(statuses).toEqual(["blocked", "failed"]);
		const spanStatuses = meta.map((event) => {
			if (event.type !== "tool_execution_end") throw new Error("Unexpected event");
			return event.meta.span?.status;
		});
		expect(spanStatuses).toEqual(["blocked", "error"]);
	});

	test("aborts timed out provider requests", async () => {
		const completions: Array<{ error?: unknown; aborted?: boolean; span?: unknown }> = [];
		const traces: AgentEvent[] = [];
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [] },
			requestTimeoutMs: 1,
			providerRequestObserver: {
				onRequestComplete: ({ error, aborted, span }) => {
					completions.push({ error, aborted, span });
				},
			},
			streamFn: () =>
				({
					[Symbol.asyncIterator]: () => ({
						next: () => new Promise<IteratorResult<AssistantMessageEvent>>(() => {}),
					}),
					result: () => new Promise<AssistantMessage>(() => {}),
				}) as unknown as AssistantMessageEventStream,
		});
		agent.subscribe((event) => {
			if (event.type === "runtime_trace") {
				traces.push(event);
			}
		});

		await agent.prompt("start");

		expect(completions).toHaveLength(1);
		expect(completions[0]?.aborted).toBe(true);
		expect(completions[0]?.error).toBeInstanceOf(Error);
		expect((completions[0]?.error as Error).message).toBe("Provider request timed out after 1ms");
		expect(completions[0]?.span).toEqual(
			expect.objectContaining({ kind: "request", status: "timeout", name: "request" }),
		);
		expect(agent.state.errorMessage).toBe("Provider request timed out after 1ms");
		expect(traces).toHaveLength(1);
		expect(traces[0]?.type).toBe("runtime_trace");
		if (traces[0]?.type !== "runtime_trace") throw new Error("Request trace was not emitted");
		expect(traces[0].trace.span).toEqual(
			expect.objectContaining({ kind: "request", status: "timeout", name: "request" }),
		);
	});

	test("limits parallel tool concurrency while preserving result order", async () => {
		let activeTools = 0;
		let maxActiveTools = 0;
		let streamCalls = 0;
		const resultOrder: string[] = [];
		const createDelayedTool = (name: string): AgentTool =>
			repeatTool(name, async () => {
				activeTools += 1;
				maxActiveTools = Math.max(maxActiveTools, activeTools);
				await new Promise((resolve) => setTimeout(resolve, 5));
				activeTools -= 1;
				return { content: [{ type: "text", text: name }], details: { name } };
			});
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: "test",
				tools: [createDelayedTool("first"), createDelayedTool("second")],
			},
			maxToolConcurrency: 1,
			streamFn: () => {
				streamCalls += 1;
				return doneStream(
					streamCalls === 1
						? assistantToolCall([
								{ type: "toolCall", id: "call-1", name: "first", arguments: { value: "same" } },
								{ type: "toolCall", id: "call-2", name: "second", arguments: { value: "same" } },
							])
						: assistantText("done"),
				);
			},
		});
		agent.subscribe((event) => {
			if (event.type === "message_end" && event.message.role === "toolResult") {
				resultOrder.push(event.message.toolName);
			}
		});

		await agent.prompt("start");

		expect(maxActiveTools).toBe(1);
		expect(resultOrder).toEqual(["first", "second"]);
	});
});
