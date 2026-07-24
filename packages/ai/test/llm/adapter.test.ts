import {
	type Api,
	type AssistantMessage,
	type Context,
	type LLMAdapter,
	type LLMContentBlock,
	type LLMMessage,
	type LLMResponse,
	type LLMToolDef,
	type Model,
	PiProviderAdapter,
	type StreamOptions,
	type TokenUsage,
} from "@tsuuanmi/pi-ai";
import { describe, expect, it } from "vitest";

function testModel(): Model<"openai-completions"> {
	return {
		id: "test-model",
		name: "Test Model",
		api: "openai-completions",
		provider: "test-provider",
		baseUrl: "https://example.test",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000,
		maxTokens: 100,
	};
}

describe("PiProviderAdapter", () => {
	it("exports the requested LLM contract aliases", async () => {
		const message: LLMMessage = { role: "user", content: "Hello" };
		const block: LLMContentBlock = { type: "text", text: "Hello" };
		const tool: LLMToolDef = { name: "lookup", parameters: { type: "object" } };
		const usage: TokenUsage = {
			inputTokens: 1,
			outputTokens: 2,
			cacheReadTokens: 3,
			cacheWriteTokens: 4,
			totalTokens: 10,
		};
		const response: LLMResponse = { content: "ok", parts: [block], usage };
		const adapter: LLMAdapter = { complete: async () => response };

		expect(message.role).toBe("user");
		expect(tool.name).toBe("lookup");
		await expect(adapter.complete([message])).resolves.toBe(response);
	});

	it("preserves system prompts, multi-block content, tools, provider options, and abort signals", async () => {
		const controller = new AbortController();
		const adapter = new PiProviderAdapter({
			model: testModel(),
			completeSimple: async (
				_model: Model<Api>,
				context: Context,
				options?: StreamOptions,
			): Promise<AssistantMessage> => {
				expect(context.systemPrompt).toBe("System prompt");
				expect(context.messages[0]).toMatchObject({ role: "user" });
				expect(context.messages[0]?.content).toEqual([
					{ type: "text", text: "Hello", textSignature: undefined },
					{ type: "text", text: "World", textSignature: "sig" },
				]);
				expect(context.messages[1]).toMatchObject({
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "lookup",
					isError: true,
				});
				expect(context.tools?.[0]).toMatchObject({ name: "lookup", description: "Lookup" });
				expect(options?.temperature).toBe(0.2);
				expect(options?.maxTokens).toBe(50);
				expect(options?.signal).toBe(controller.signal);
				return {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "hidden", thinkingSignature: "think-sig", redacted: true },
						{ type: "text", text: "Hi", textSignature: "text-sig" },
						{
							type: "toolCall",
							id: "call-2",
							name: "write",
							arguments: { path: "x" },
							thoughtSignature: "thought",
						},
					],
					api: "openai-completions",
					provider: "test-provider",
					model: "test-model",
					stopReason: "toolUse",
					timestamp: Date.now(),
					usage: {
						input: 2,
						output: 3,
						cacheRead: 4,
						cacheWrite: 5,
						totalTokens: 14,
						cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
					},
				};
			},
		});

		const response = await adapter.complete(
			[
				{ role: "system", content: "System prompt" },
				{
					role: "user",
					content: [
						{ type: "text", text: "Hello" },
						{ type: "text", text: "World", textSignature: "sig" },
					],
				},
				{
					role: "tool",
					content: [
						{ type: "toolResult", toolCallId: "call-1", toolName: "lookup", content: "Result", isError: true },
					],
				},
			],
			{
				maxTokens: 50,
				temperature: 0.2,
				signal: controller.signal,
				tools: [{ name: "lookup", description: "Lookup", parameters: { type: "object" } }],
			},
		);

		expect(response.content).toBe("Hi");
		expect(response.parts).toEqual([
			{ type: "thinking", thinking: "hidden", thinkingSignature: "think-sig", redacted: true },
			{ type: "text", text: "Hi", textSignature: "text-sig" },
			{ type: "toolCall", id: "call-2", name: "write", arguments: { path: "x" } },
		]);
		expect(response.toolCalls).toEqual([{ type: "toolCall", id: "call-2", name: "write", arguments: { path: "x" } }]);
		expect(response.usage).toEqual({
			inputTokens: 2,
			outputTokens: 3,
			cacheReadTokens: 4,
			cacheWriteTokens: 5,
			totalTokens: 14,
			cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
		});
		expect(response.stopReason).toBe("tool_use");
	});

	it("does not mutate provider/model registries while adapting calls", async () => {
		const model = testModel();
		const adapter = new PiProviderAdapter({
			model,
			completeSimple: async (seenModel: Model<Api>): Promise<AssistantMessage> => ({
				role: "assistant",
				content: [{ type: "text", text: seenModel.id }],
				api: seenModel.api,
				provider: seenModel.provider,
				model: seenModel.id,
				stopReason: "stop",
				timestamp: Date.now(),
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			}),
		});

		const response = await adapter.complete([{ role: "user", content: "Hello" }], { model: "override-model" });

		expect(response.content).toBe("override-model");
		expect(model.id).toBe("test-model");
	});
});
