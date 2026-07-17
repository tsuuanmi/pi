import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModel } from "../../src/models.ts";
import { streamOpenAICompletions } from "../../src/providers/openai-completions.ts";
import type { AssistantMessage, Message, Model } from "../../src/types.ts";

interface FakeOpenAIClientOptions {
	apiKey: string;
	baseURL: string;
	dangerouslyAllowBrowser: boolean;
	defaultHeaders?: Record<string, string>;
}

interface CapturedCompletionsPayload {
	prompt_cache_key?: string;
	prompt_cache_retention?: "24h" | "in-memory" | null;
}

const mockState = vi.hoisted(() => ({
	lastParams: undefined as CapturedCompletionsPayload | undefined,
	lastClientOptions: undefined as FakeOpenAIClientOptions | undefined,
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: (params: CapturedCompletionsPayload) => {
					mockState.lastParams = params;
					const stream = {
						async *[Symbol.asyncIterator]() {
							yield {
								choices: [{ delta: {}, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 1,
									completion_tokens: 1,
									prompt_tokens_details: { cached_tokens: 0 },
									completion_tokens_details: { reasoning_tokens: 0 },
								},
							};
						},
					};
					const promise = Promise.resolve(stream) as Promise<typeof stream> & {
						withResponse: () => Promise<{
							data: typeof stream;
							response: { status: number; headers: Headers };
						}>;
					};
					promise.withResponse = async () => ({
						data: stream,
						response: { status: 200, headers: new Headers() },
					});
					return promise;
				},
			},
		};

		constructor(options: FakeOpenAIClientOptions) {
			mockState.lastClientOptions = options;
		}
	}

	return { default: FakeOpenAI };
});

describe("openai-completions prompt caching", () => {
	const originalEnv = process.env.PI_CACHE_RETENTION;

	beforeEach(() => {
		mockState.lastParams = undefined;
		mockState.lastClientOptions = undefined;
		delete process.env.PI_CACHE_RETENTION;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.PI_CACHE_RETENTION;
		} else {
			process.env.PI_CACHE_RETENTION = originalEnv;
		}
	});

	function createModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
		const { compat: _compat, ...baseModel } = getModel("openai", "gpt-4o-mini");
		return {
			...(baseModel as Omit<Model<"openai-completions">, "api">),
			api: "openai-completions",
			...overrides,
		};
	}

	async function captureRequest(
		options?: {
			cacheRetention?: "none" | "short" | "long";
			sessionId?: string;
			headers?: Record<string, string>;
		},
		model: Model<"openai-completions"> = createModel(),
	) {
		await streamOpenAICompletions(
			model,
			{
				systemPrompt: "sys",
				messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
			},
			{ apiKey: "test-key", ...options },
		).result();

		return {
			payload: mockState.lastParams,
			headers: mockState.lastClientOptions?.defaultHeaders ?? {},
		};
	}

	it("sets prompt_cache_key for direct OpenAI requests when caching is enabled", async () => {
		const { payload } = await captureRequest({ sessionId: "session-123" });

		expect(payload?.prompt_cache_key).toBe("session-123");
		expect(payload?.prompt_cache_retention).toBeUndefined();
	});

	it("sets prompt_cache_retention to 24h for direct OpenAI requests when cacheRetention is long", async () => {
		const { payload } = await captureRequest({ cacheRetention: "long", sessionId: "session-456" });

		expect(payload?.prompt_cache_key).toBe("session-456");
		expect(payload?.prompt_cache_retention).toBe("24h");
	});

	it("clamps prompt_cache_key to OpenAI's 64-character limit", async () => {
		const sessionId = "x".repeat(67);
		const { payload } = await captureRequest({ sessionId });

		expect(payload?.prompt_cache_key).toBe("x".repeat(64));
	});

	it("omits prompt cache fields when cacheRetention is none", async () => {
		const { payload } = await captureRequest({ cacheRetention: "none", sessionId: "session-789" });

		expect(payload?.prompt_cache_key).toBeUndefined();
		expect(payload?.prompt_cache_retention).toBeUndefined();
	});

	it("emits prompt_cache_key for non-OpenAI base URLs when supportsPromptCacheKey is true (default)", async () => {
		const model = createModel({
			baseUrl: "https://proxy.example.com/v1",
			compat: { supportsLongCacheRetention: false },
		});
		const { payload } = await captureRequest({ cacheRetention: "long", sessionId: "session-proxy" }, model);

		// Default-on: prompt_cache_key is emitted for any openai-completions provider
		// unless explicitly opted out via compat.supportsPromptCacheKey === false.
		expect(payload?.prompt_cache_key).toBe("session-proxy");
		// prompt_cache_retention still requires supportsLongCacheRetention (false here).
		expect(payload?.prompt_cache_retention).toBeUndefined();
	});

	it("omits prompt_cache_key when compat.supportsPromptCacheKey is false (per-provider opt-out)", async () => {
		const model = createModel({
			baseUrl: "https://proxy.example.com/v1",
			compat: { supportsPromptCacheKey: false },
		});
		const { payload } = await captureRequest({ sessionId: "session-optout" }, model);

		expect(payload?.prompt_cache_key).toBeUndefined();
		expect(payload?.prompt_cache_retention).toBeUndefined();
	});

	it("uses PI_CACHE_RETENTION for direct OpenAI requests", async () => {
		process.env.PI_CACHE_RETENTION = "long";
		const { payload } = await captureRequest({ sessionId: "session-env" });

		expect(payload?.prompt_cache_key).toBe("session-env");
		expect(payload?.prompt_cache_retention).toBe("24h");
	});

	it("sends known session-affinity headers when compat.sendSessionAffinityHeaders is enabled", async () => {
		const model = createModel({
			baseUrl: "https://proxy.example.com/v1",
			compat: { sendSessionAffinityHeaders: true },
		});
		const { headers } = await captureRequest({ sessionId: "session-affinity" }, model);

		expect(headers.session_id).toBe("session-affinity");
		expect(headers["x-client-request-id"]).toBe("session-affinity");
		expect(headers["x-session-affinity"]).toBe("session-affinity");
	});

	it("omits session-affinity headers when cacheRetention is none", async () => {
		const model = createModel({
			baseUrl: "https://proxy.example.com/v1",
			compat: { sendSessionAffinityHeaders: true },
		});
		const { headers } = await captureRequest({ cacheRetention: "none", sessionId: "session-affinity" }, model);

		expect(headers.session_id).toBeUndefined();
		expect(headers["x-client-request-id"]).toBeUndefined();
		expect(headers["x-session-affinity"]).toBeUndefined();
	});

	it("lets explicit headers override generated session-affinity headers", async () => {
		const model = createModel({
			baseUrl: "https://proxy.example.com/v1",
			compat: { sendSessionAffinityHeaders: true },
		});
		const { headers } = await captureRequest(
			{
				sessionId: "session-affinity",
				headers: {
					session_id: "override-session",
					"x-client-request-id": "override-request",
					"x-session-affinity": "override-affinity",
				},
			},
			model,
		);

		expect(headers.session_id).toBe("override-session");
		expect(headers["x-client-request-id"]).toBe("override-request");
		expect(headers["x-session-affinity"]).toBe("override-affinity");
	});
});

describe("openai-completions convertMessages prior-turn thinking strip", () => {
	beforeEach(() => {
		mockState.lastParams = undefined;
		mockState.lastClientOptions = undefined;
		delete process.env.PI_CACHE_RETENTION;
	});

	function createStripModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
		const { compat: _compat, ...baseModel } = getModel("openai", "gpt-4o-mini");
		return {
			...(baseModel as Omit<Model<"openai-completions">, "api">),
			api: "openai-completions",
			baseUrl: "https://proxy.example.com/v1",
			...overrides,
		};
	}

	function makeAssistant(thinking: string, thinkingSignature: string): AssistantMessage {
		return {
			role: "assistant",
			content: [
				{ type: "thinking", thinking, thinkingSignature },
				{ type: "text", text: "ok" },
			],
			api: "openai-completions",
			provider: "openai",
			model: "gpt-4o-mini",
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
	}

	async function captureMessages(messages: Message[]): Promise<any[]> {
		await streamOpenAICompletions(
			createStripModel(),
			{ systemPrompt: "sys", messages },
			{ apiKey: "test-key", sessionId: "session-strip" },
		).result();
		return (mockState.lastParams as any)?.messages ?? [];
	}

	it("drops prior-turn field-name-signature reasoning but keeps the last assistant turn's reasoning", async () => {
		const messages: Message[] = [
			{ role: "user", content: "first", timestamp: Date.now() },
			makeAssistant("prior reasoning body", "reasoning"),
			{ role: "user", content: "second", timestamp: Date.now() },
			makeAssistant("last reasoning body", "reasoning"),
			{ role: "user", content: "third", timestamp: Date.now() },
		];
		const captured = await captureMessages(messages);
		const assistantCaptured = captured.filter((m: any) => m.role === "assistant");

		expect(assistantCaptured).toHaveLength(2);
		expect(assistantCaptured[0].reasoning).toBeUndefined();
		expect(assistantCaptured[0].content).toBe("ok");
		expect(assistantCaptured[1].reasoning).toBe("last reasoning body");
		expect(assistantCaptured[1].content).toBe("ok");
	});

	it("strips reasoning_content and reasoning_text signatures on prior turns too", async () => {
		for (const sig of ["reasoning_content", "reasoning_text"]) {
			const messages: Message[] = [
				{ role: "user", content: "q", timestamp: Date.now() },
				makeAssistant("prior", sig),
				{ role: "user", content: "q2", timestamp: Date.now() },
				makeAssistant("last", sig),
			];
			const captured = await captureMessages(messages);
			const assistantCaptured = captured.filter((m: any) => m.role === "assistant");
			expect(assistantCaptured[0][sig]).toBeUndefined();
			expect(assistantCaptured[1][sig]).toBe("last");
		}
	});

	it("preserves reasoning_details from toolCall.thoughtSignature (encrypted reasoning contract)", async () => {
		const prior: AssistantMessage = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "prior", thinkingSignature: "reasoning" },
				{
					type: "toolCall",
					id: "call_1",
					name: "t",
					arguments: { x: 1 },
					thoughtSignature: JSON.stringify({ type: "reasoning.encrypted", id: "enc1", data: "secret" }),
				},
			],
			api: "openai-completions",
			provider: "openai",
			model: "gpt-4o-mini",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "toolUse",
			timestamp: Date.now(),
		};
		const messages: Message[] = [
			{ role: "user", content: "q", timestamp: Date.now() },
			prior,
			{
				role: "toolResult",
				toolCallId: "call_1",
				toolName: "t",
				content: [{ type: "text", text: "result" }],
				isError: false,
				timestamp: Date.now(),
			},
			makeAssistant("last turn reasoning", "reasoning"),
		];
		const captured = await captureMessages(messages);
		const assistantCaptured = captured.filter((m: any) => m.role === "assistant");
		expect(assistantCaptured).toHaveLength(2);
		// Prior turn: field-name reasoning stripped...
		expect(assistantCaptured[0].reasoning).toBeUndefined();
		// ...but encrypted reasoning_details from thoughtSignature survive, and tool_calls are preserved.
		expect(assistantCaptured[0].reasoning_details).toEqual([
			{ type: "reasoning.encrypted", id: "enc1", data: "secret" },
		]);
		expect(assistantCaptured[0].tool_calls).toHaveLength(1);
		// Last assistant turn: reasoning preserved.
		expect(assistantCaptured[1].reasoning).toBe("last turn reasoning");
	});
});
