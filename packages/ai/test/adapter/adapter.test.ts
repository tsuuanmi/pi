import {
	Adapter,
	type AssistantMessage,
	AssistantMessageEventStream,
	clearProviders,
	type Model,
	registerProvider,
} from "@tsuuanmi/pi-ai";
import { afterEach, describe, expect, it } from "vitest";

const model: Model<"adapter-test"> = {
	id: "adapter-model",
	name: "Adapter Model",
	api: "adapter-test",
	provider: "adapter-test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1000,
	maxTokens: 100,
};

afterEach(() => {
	clearProviders();
});

describe("Adapter", () => {
	it("streams and completes against a registered provider", async () => {
		registerProvider({
			api: "adapter-test",
			stream: () => {
				const stream = new AssistantMessageEventStream();
				const message: AssistantMessage = {
					role: "assistant",
					content: [{ type: "text", text: "Hello" }],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "stop",
					timestamp: Date.now(),
				};
				stream.push({ type: "done", reason: "stop", message });
				stream.end(message);
				return stream;
			},
		});

		const adapter = new Adapter({ model });
		const response = await adapter.complete({ messages: [{ role: "user", content: "Hi", timestamp: 1 }] });

		expect(response.content).toEqual([{ type: "text", text: "Hello" }]);
		expect(response.stopReason).toBe("stop");
	});
});
