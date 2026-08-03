import type { AgentTool } from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	type Model,
} from "@tsuuanmi/pi-ai";
import { Type } from "typebox";

export const model: Model<"openai-completions"> = {
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

export function assistantText(text: string): AssistantMessage {
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

export function assistantToolCall(
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

export function repeatTool(name = "repeat", execute?: AgentTool["execute"]): AgentTool {
	return {
		name,
		description: name,
		label: name,
		parameters: Type.Object({ value: Type.String() }),
		execute: execute ?? (async () => ({ content: [{ type: "text", text: "same" }], details: {} })),
	};
}

export function doneStream(message: AssistantMessage): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		stream.push({ type: "start", partial: { ...message, content: [] } });
		stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message });
	});
	return stream;
}

export function pendingStream(message: AssistantMessage): AssistantMessageEventStream {
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
