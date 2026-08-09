import type { AssistantMessageEvent, Context, Model } from "@tsuuanmi/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createSubagentStream } from "#workflows/orchestration/subagent-stream";

const model: Model<"openai-responses"> = {
	id: "test-model",
	name: "Test Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_192,
	maxTokens: 1_024,
};

const context: Context = {
	systemPrompt: "Test system prompt",
	messages: [{ role: "user", content: "Run the task", timestamp: 1 }],
};

describe("createSubagentStream", () => {
	it("emits one complete assistant text response", async () => {
		const controller = new AbortController();
		const run = vi.fn(async () => "completed output");
		const stream = await createSubagentStream(run)(model, context, { signal: controller.signal });
		const events = await collect(stream);

		expect(run).toHaveBeenCalledWith({ model, context, signal: controller.signal });
		expect(events.map((event) => event.type)).toEqual(["start", "text_start", "text_delta", "text_end", "done"]);
		expect(await stream.result()).toMatchObject({
			role: "assistant",
			content: [{ type: "text", text: "completed output" }],
			api: model.api,
			provider: model.provider,
			model: model.id,
			stopReason: "stop",
		});
	});

	it("emits no text events for empty output", async () => {
		const stream = await createSubagentStream(async () => "")(model, context);
		const events = await collect(stream);

		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
		expect(await stream.result()).toMatchObject({ content: [{ type: "text", text: "" }] });
	});

	it("maps failures and cancellation to terminal error events", async () => {
		const failure = await createSubagentStream(async () => {
			throw new Error("worker failed");
		})(model, context);
		const failedEvents = await collect(failure);
		expect(failedEvents.map((event) => event.type)).toEqual(["start", "error"]);
		expect(await failure.result()).toMatchObject({ stopReason: "error", errorMessage: "worker failed" });

		const controller = new AbortController();
		controller.abort();
		const cancelled = await createSubagentStream(async () => {
			throw new Error("cancelled");
		})(model, context, { signal: controller.signal });
		await collect(cancelled);
		expect(await cancelled.result()).toMatchObject({ stopReason: "aborted", errorMessage: "cancelled" });
	});
});

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
	const events: AssistantMessageEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}
