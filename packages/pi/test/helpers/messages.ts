import type { AssistantMessage } from "@tsuuanmi/pi-ai";

export const API_KEY = process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;

export function userMsg(text: string) {
	return { role: "user" as const, content: text, timestamp: Date.now() };
}

export function assistantMsg(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}
