import { describe, expect, it, vi } from "vitest";
import { getModel } from "../../src/models.ts";
import { streamOpenAICompletions } from "../../src/providers/openai-completions.ts";
import type { Model } from "../../src/types.ts";

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: () => {
					const stream = {
						async *[Symbol.asyncIterator]() {
							yield {
								id: "chatcmpl-test",
								model: "gpt-test",
								choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 3,
									completion_tokens: 2,
									prompt_tokens_details: { cached_tokens: 1 },
								},
							};
						},
					};
					const promise = Promise.resolve(stream) as Promise<typeof stream> & {
						withResponse: () => Promise<{ data: typeof stream; response: { status: number; headers: Headers } }>;
					};
					promise.withResponse = async () => ({ data: stream, response: { status: 200, headers: new Headers() } });
					return promise;
				},
			},
		};
	}
	return { default: FakeOpenAI };
});

describe("usage provenance", () => {
	it("marks parsed OpenAI completions usage as provider reported", async () => {
		const { compat: _compat, ...baseModel } = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...(baseModel as Omit<Model<"openai-completions">, "api">),
			api: "openai-completions",
		};
		const message = await streamOpenAICompletions(
			model,
			{ systemPrompt: "sys", messages: [{ role: "user", content: "hi", timestamp: Date.now() }] },
			{ apiKey: "test-key" },
		).result();

		expect(message.usage.input).toBe(2);
		expect(message.usage.cacheRead).toBe(1);
		expect(message.usageProvenance).toEqual({
			type: "provider_reported",
			fields: ["prompt_tokens", "completion_tokens", "prompt_tokens_details"],
		});
	});
});
