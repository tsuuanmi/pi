import { Agent, type AgentEvent, type Tool } from "@tsuuanmi/pi-agent";
import { Type } from "typebox";
import { describe, expect, test } from "vitest";
import { assistantText, assistantToolCall, doneStream, model, repeatTool } from "#agent-test/fixtures";

describe("tool output and execution", () => {
	test("limits tool output with per-tool precedence", async () => {
		let streamCalls = 0;
		const results: string[] = [];
		const meta: AgentEvent[] = [];
		const limitedTool = repeatTool(
			"limited",
			async () => ({
				content: [{ type: "text", text: "abcdefghijklmnopqrstuvwxyz" }],
				details: {},
			}),
			{ maxOutputChars: 5 },
		);
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [limitedTool] },
			maxToolOutputChars: 10,
			stream: () => {
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
		const tool = repeatTool(
			"validated",
			async () => ({
				content: [{ type: "text", text: "ok" }],
				details: { count: 1 },
			}),
			{ detailsSchema: Type.Object({ count: Type.Number() }) },
		);
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			stream: () => {
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
		const tool = repeatTool(
			"invalid",
			async () => ({
				content: [{ type: "text", text: "bad" }],
				details: { count: "one" },
			}),
			{ detailsSchema: Type.Object({ count: Type.Number() }) },
		);
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			stream: () => {
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
		const tool = repeatTool(
			"after-invalid",
			async () => ({
				content: [{ type: "text", text: "ok" }],
				details: { count: 1 },
			}),
			{ detailsSchema: Type.Object({ count: Type.Number() }) },
		);
		const agent = new Agent({
			initialState: { model, systemPrompt: "test", tools: [tool] },
			hooks: [
				{
					name: "invalid-details",
					afterToolCall: async () => ({ details: { count: "one" } }),
				},
			],
			stream: () => {
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
			stream: () => {
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

	test("limits parallel tool concurrency while preserving result order", async () => {
		let activeTools = 0;
		let maxActiveTools = 0;
		let streamCalls = 0;
		const resultOrder: string[] = [];
		const createDelayedTool = (name: string): Tool =>
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
			stream: () => {
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
