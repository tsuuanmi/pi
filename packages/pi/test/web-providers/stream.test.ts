import type { Context, Model } from "@tsuuanmi/pi-ai";
import { CHATGPT_WEB_PROVIDER_ID, type WebTurnEvent } from "@tsuuanmi/pi-web-runtime";
import { describe, expect, test } from "vitest";
import type { AuthStorage } from "#pi/auth/storage";
import type { BrowserCredential } from "#pi/auth/types";
import type { WebProviderHost } from "#pi/web-providers/host";
import { createWebStream } from "#pi/web-providers/stream";
import type { WebTurnRequest } from "#pi/web-providers/turn";

const credential: BrowserCredential = {
	type: "browser",
	profileId: "profile-1234567890123456",
	tunnelSecret: "secret",
};

const model: Model<"web"> = {
	id: "route-high",
	name: "Route High",
	api: "web",
	provider: CHATGPT_WEB_PROVIDER_ID,
	baseUrl: undefined,
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 32_000,
	maxTokens: 16_384,
};

function authStorage(account: string | undefined): AuthStorage {
	return {
		getActiveAccount: () => account,
		getBrowserAccount: () => (account ? credential : undefined),
	} as unknown as AuthStorage;
}

function host(events: readonly WebTurnEvent[] = [{ type: "text", text: "hello" }, { type: "done" }]): WebProviderHost {
	return {
		get: () => ({ models: [{ id: model.id, output: ["text", "reasoning"] }] }),
		runTurn: async (request: WebTurnRequest) => {
			for (const event of events) await request.onEvent(event);
		},
	} as unknown as WebProviderHost;
}

describe("createWebStream", () => {
	test("converts browser text events to an assistant result", async () => {
		const context: Context = {
			systemPrompt: "Be concise",
			messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
		};
		const stream = createWebStream(
			host(),
			authStorage("work"),
			CHATGPT_WEB_PROVIDER_ID,
			async () => undefined,
		)(model, context);

		const result = await stream.result();
		expect(result.stopReason).toBe("stop");
		expect(result.content).toEqual([{ type: "text", text: "hello" }]);
	});

	test("preserves reasoning-before-text content order", async () => {
		const context: Context = {
			messages: [{ role: "user", content: "Explain", timestamp: 1 }],
		};
		const stream = createWebStream(
			host([{ type: "reasoning", text: "Checking" }, { type: "text", text: "answer" }, { type: "done" }]),
			authStorage("work"),
			CHATGPT_WEB_PROVIDER_ID,
			async () => undefined,
		)(model, context);

		const result = await stream.result();
		expect(result.content).toEqual([
			{ type: "thinking", thinking: "Checking" },
			{ type: "text", text: "answer" },
		]);
	});

	test("fails when no browser account is active", async () => {
		const context: Context = { messages: [{ role: "user", content: "Say hello", timestamp: 1 }] };
		const stream = createWebStream(
			host(),
			authStorage(undefined),
			CHATGPT_WEB_PROVIDER_ID,
			async () => undefined,
		)(model, context);

		const result = await stream.result();
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toMatch(/no active browser account/);
	});
});
