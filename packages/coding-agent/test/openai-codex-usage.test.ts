import { Buffer } from "node:buffer";
import type { Api, Model } from "@tsuuanmi/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRegistry } from "../src/core/model-registry.ts";
import { fetchOpenAICodexUsageSummary } from "../src/core/openai-codex-usage.ts";

const originalFetch = globalThis.fetch;

function encodeBase64Url(value: string): string {
	return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createJwt(payload: Record<string, unknown>): string {
	return `${encodeBase64Url(JSON.stringify({ alg: "none" }))}.${encodeBase64Url(JSON.stringify(payload))}.signature`;
}

function createCodexModel(baseUrl = "https://chatgpt.com"): Model<Api> {
	return {
		id: "gpt-5.5",
		name: "gpt-5.5",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 272000,
		maxTokens: 128000,
	};
}

function createModelRegistry(token: string): ModelRegistry {
	return {
		isUsingOAuth: () => true,
		getApiKeyAndHeaders: async () => ({ ok: true, apiKey: token, headers: { "X-Test": "yes" } }),
	} as unknown as ModelRegistry;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe("fetchOpenAICodexUsageSummary", () => {
	it("fetches Codex quota windows from wham usage", async () => {
		const token = createJwt({
			"https://api.openai.com/auth": { chatgpt_account_id: "account-123" },
		});
		let requestedUrl = "";
		let requestedHeaders: Headers | undefined;
		globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
			requestedUrl = String(input);
			requestedHeaders = new Headers(init?.headers);
			return new Response(
				JSON.stringify({
					rate_limit: {
						limit_reached: false,
						primary_window: { used_percent: 12.345, limit_window_seconds: 5 * 60 * 60 },
						secondary_window: { used_percent: 67.89, limit_window_seconds: 7 * 24 * 60 * 60 },
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});

		const summary = await fetchOpenAICodexUsageSummary(createModelRegistry(token), createCodexModel());

		expect(requestedUrl).toBe("https://chatgpt.com/backend-api/wham/usage");
		expect(requestedHeaders?.get("authorization")).toBe(`Bearer ${token}`);
		expect(requestedHeaders?.get("chatgpt-account-id")).toBe("account-123");
		expect(requestedHeaders?.get("x-test")).toBe("yes");
		expect(summary).toEqual({ text: "5H 12.3% 1W 67.9%", status: "ok" });
	});
});
