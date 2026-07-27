import { Agent, type AgentEvent, parseStructuredOutput } from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
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

function assistantToolCall(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id: "call-1", name: "repeat", arguments: { value: "same" } }],
		api: "test",
		provider: "test",
		model: "test-model",
		usage,
		stopReason: "toolUse",
		timestamp: Date.now(),
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

describe("agent reliability helpers", () => {
	test("detects repeated tool-call loops when configured", async () => {
		const events: string[] = [];
		const agent = new Agent({
			initialState: {
				model,
				systemPrompt: "test",
				tools: [
					{
						name: "repeat",
						description: "repeat",
						label: "Repeat",
						parameters: Type.Object({ value: Type.String() }),
						execute: async () => ({ content: [{ type: "text", text: "same" }], details: {} }),
					},
				],
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
});
