import { type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@tsuuanmi/pi-ai";
import { describe, expect, it } from "vitest";
import { agentLoop } from "#agent/agent-loop";
import type { AgentContext, AgentLoopConfig, AgentMessage, ProviderRequestObserver } from "#agent/types";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("unexpected event");
			},
		);
		queueMicrotask(() => {
			this.push({ type: "done", reason: "stop", message });
		});
	}
}

function model(): Model<any> {
	return {
		id: "m",
		name: "m",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000,
		maxTokens: 100,
	};
}

function assistant(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		api: "openai-responses",
		provider: "openai",
		model: "m",
		usage: {
			input: 1,
			output: 2,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 3,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		usageProvenance: { type: "provider_reported", fields: ["input_tokens", "output_tokens"] },
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("providerRequestObserver", () => {
	it("observes final payload and completion without allowing observer errors to fail the loop", async () => {
		const calls: string[] = [];
		const observer: ProviderRequestObserver = {
			onRequestStart: () => {
				calls.push("start");
				throw new Error("ignored");
			},
			onRequestPayload: (event) => {
				calls.push(`payload:${JSON.stringify(event.payload)}`);
			},
			onRequestResponse: (event) => {
				calls.push(`response:${event.response.status}`);
			},
			onRequestComplete: (event) => {
				calls.push(`complete:${event.message?.stopReason}`);
			},
		};
		const config: AgentLoopConfig = {
			model: model(),
			convertToLlm: (messages) => messages.filter((message) => message.role === "user") as any,
			onPayload: () => ({ final: true }),
			providerRequestObserver: observer,
		};
		const context: AgentContext = { systemPrompt: "s", messages: [], tools: [] };
		const prompt: AgentMessage = { role: "user", content: "hello", timestamp: Date.now() };
		const stream = agentLoop([prompt], context, config, undefined, (_model, _context, options) => {
			void options?.onPayload?.({ original: true }, model());
			void options?.onResponse?.({ status: 200, headers: { "content-type": "application/json" } }, model());
			return new MockAssistantStream(assistant());
		});

		await stream.result();

		expect(calls).toEqual(["start", 'payload:{"final":true}', "response:200", "complete:stop"]);
	});
});
