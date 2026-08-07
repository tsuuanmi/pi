import type { Context, Model } from "@tsuuanmi/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "#pi/api/extension-types";
import type { ProviderConfig } from "#pi/api/provider-types";
import { getBuiltinExtensionFactories } from "#pi/extensions/builtins";
import builtinChatGptWebExtension from "#pi/extensions/chatgpt-web/extension";
import { CHATGPT_WEB_BASE_URL_ENV } from "#pi/extensions/chatgpt-web/models";

interface Registration {
	name: string;
	config: ProviderConfig;
}

const context: Context = {
	messages: [
		{
			role: "user",
			content: [{ type: "text", text: "hello" }],
			timestamp: 0,
		},
	],
};

function createModel(id: string, api: Model["api"] = "openai-responses"): Model {
	return {
		id,
		name: "Test model",
		api,
		provider: "chatgpt-web",
		baseUrl: "http://127.0.0.1:17841/v1",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 150_000,
		maxTokens: 128_000,
	};
}

describe("ChatGPT Web built-in provider", () => {
	let previousBaseUrl: string | undefined;

	beforeEach(() => {
		previousBaseUrl = process.env[CHATGPT_WEB_BASE_URL_ENV];
		delete process.env[CHATGPT_WEB_BASE_URL_ENV];
	});

	afterEach(() => {
		if (previousBaseUrl === undefined) delete process.env[CHATGPT_WEB_BASE_URL_ENV];
		else process.env[CHATGPT_WEB_BASE_URL_ENV] = previousBaseUrl;
	});

	function register(): Registration | undefined {
		let registration: Registration | undefined;
		const pi = {
			registerProvider(name: string, config: ProviderConfig): void {
				registration = { name, config };
			},
		} as unknown as ExtensionAPI;
		builtinChatGptWebExtension(pi);
		return registration;
	}

	it("is included in the builtin extension registry", () => {
		expect(getBuiltinExtensionFactories()).toContain(builtinChatGptWebExtension);
	});

	it("does not register without an explicit bridge URL", () => {
		expect(register()).toBeUndefined();
	});

	it("registers fixed bridge routes with a normalized URL", () => {
		process.env[CHATGPT_WEB_BASE_URL_ENV] = "http://127.0.0.1:17841/v1/";

		const registration = register();
		expect(registration?.name).toBe("chatgpt-web");
		expect(registration?.config.baseUrl).toBe("http://127.0.0.1:17841/v1");
		expect(registration?.config.api).toBe("openai-responses");
		expect(registration?.config.models?.map((model) => model.id)).toEqual([
			"light",
			"medium",
			"high",
			"extra-high",
			"pro",
		]);
		expect(registration?.config.models?.map((model) => model.contextWindow)).toEqual([
			150_000, 150_000, 185_000, 256_000, 272_000,
		]);
		expect(registration?.config.models?.every((model) => model.reasoning === false)).toBe(true);
	});

	it.each([
		"127.0.0.1:17841/v1",
		"ftp://127.0.0.1:17841/v1",
		"http://127.0.0.1:17841/v2",
		"http://user:pass@127.0.0.1:17841/v1",
		"http://127.0.0.1:17841/v1?token=secret",
	])("rejects an invalid bridge URL: %s", (baseUrl) => {
		process.env[CHATGPT_WEB_BASE_URL_ENV] = baseUrl;
		expect(() => register()).toThrow();
	});

	it("rewrites the selected model to its exact bridge route", async () => {
		process.env[CHATGPT_WEB_BASE_URL_ENV] = "http://127.0.0.1:17841/v1";
		const registration = register();
		const stream = registration?.config.stream;
		expect(stream).toBeDefined();

		let requestBody: Record<string, unknown> | undefined;
		let requestHeaders: Headers | undefined;
		const previousFetch = globalThis.fetch;
		globalThis.fetch = async (input, init) => {
			const request = input instanceof Request ? input : undefined;
			const rawBody = init?.body ?? (request ? await request.clone().text() : undefined);
			requestBody = JSON.parse(String(rawBody)) as Record<string, unknown>;
			requestHeaders = new Headers(init?.headers ?? request?.headers);
			return Response.json({ error: { message: "test" } }, { status: 500 });
		};

		try {
			const result = stream!(createModel("light"), context, { apiKey: "unexpected" });
			for await (const _event of result) {
				// Consume the stream so the request is issued and the error is finalized.
			}
		} finally {
			globalThis.fetch = previousFetch;
		}

		expect(requestBody?.model).toBe("chatgpt-web/light");
		expect(requestHeaders?.get("authorization")).toBe("Bearer local");
	});

	it("fails instead of adapting an unsupported API", () => {
		process.env[CHATGPT_WEB_BASE_URL_ENV] = "http://127.0.0.1:17841/v1";
		const registration = register();
		const stream = registration?.config.stream;
		if (!stream) throw new Error("ChatGPT Web stream was not registered");
		expect(() => stream(createModel("light", "openai-completions"), context, { apiKey: "local" })).toThrow(
			/unsupported API/,
		);
	});
});
