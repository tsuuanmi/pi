import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type Anthropic from "@anthropic-ai/sdk";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginAnthropic, refreshAnthropicToken } from "#ai/auth/oauth/anthropic";
import { getModel } from "#ai/models/index";
import { streamAnthropic } from "#ai/providers/anthropic/index";
import { streamSimple } from "#ai/stream";
import type { Context, Model, SimpleStreamOptions, Tool, ToolCall } from "#ai/types";

{
	function createSseResponse(events: Array<{ event: string; data: string }>): Response {
		const body = events.map(({ event, data }) => `event: ${event}\ndata: ${data}\n`).join("\n");
		return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
	}

	function createFakeAnthropicClient(response: Response): Anthropic {
		return {
			messages: { create: () => ({ asResponse: async () => response }) },
		} as unknown as Anthropic;
	}

	function eventsWithCacheCreation(
		cacheCreation: Record<string, number> | undefined,
	): Array<{ event: string; data: string }> {
		const startUsage: Record<string, unknown> = {
			input_tokens: 100,
			output_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 1_000_000,
		};
		if (cacheCreation) startUsage.cache_creation = cacheCreation;
		return [
			{
				event: "message_start",
				data: JSON.stringify({ type: "message_start", message: { id: "msg_test", usage: startUsage } }),
			},
			{
				event: "content_block_start",
				data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
			},
			{
				event: "content_block_delta",
				data: JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
			},
			{ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
			{
				event: "message_delta",
				data: JSON.stringify({
					type: "message_delta",
					delta: { stop_reason: "end_turn" },
					usage: {
						input_tokens: 100,
						output_tokens: 5,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 1_000_000,
					},
				}),
			},
			{ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
		];
	}

	// claude-opus-4-8: input 5, cacheWrite (5m) 6.25 per Mtok. 1h write = 2x input = 10.
	const context: Context = { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] };

	describe("Anthropic 1h cache write cost", () => {
		it("prices the 1h portion at 2x input and the rest at the 5m rate", async () => {
			const model = getModel("anthropic", "claude-opus-4-8");
			const response = createSseResponse(
				eventsWithCacheCreation({ ephemeral_5m_input_tokens: 600_000, ephemeral_1h_input_tokens: 400_000 }),
			);
			const result = await streamAnthropic(model, context, { client: createFakeAnthropicClient(response) }).result();

			expect(result.usage.cacheWrite).toBe(1_000_000);
			expect(result.usage.cacheWrite1h).toBe(400_000);
			// 600k * 6.25/Mtok + 400k * 10/Mtok = 3.75 + 4.0 = 7.75
			expect(result.usage.cost.cacheWrite).toBeCloseTo(7.75, 10);
		});

		it("falls back to the 5m rate when no breakdown is reported", async () => {
			const model = getModel("anthropic", "claude-opus-4-8");
			const response = createSseResponse(eventsWithCacheCreation(undefined));
			const result = await streamAnthropic(model, context, { client: createFakeAnthropicClient(response) }).result();

			expect(result.usage.cacheWrite).toBe(1_000_000);
			expect(result.usage.cacheWrite1h ?? 0).toBe(0);
			// 1M * 6.25/Mtok = 6.25
			expect(result.usage.cost.cacheWrite).toBeCloseTo(6.25, 10);
		});
	});
}

{
	interface CapturedRequest {
		headers: IncomingMessage["headers"];
		body: Record<string, unknown>;
	}

	function createModel(baseUrl: string): Model<"anthropic-messages"> {
		return {
			id: "claude-opus-4-8",
			name: "Claude Opus 4.8",
			api: "anthropic-messages",
			provider: "test-anthropic",
			baseUrl,
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 32000,
		};
	}

	const tool: Tool = {
		name: "lookup",
		description: "Look up a value",
		parameters: Type.Object({ value: Type.String() }),
	};

	function createContext(tools: Tool[] = [tool]): Context {
		return {
			messages: [{ role: "user", content: "Use the tool", timestamp: Date.now() }],
			...(tools.length > 0 ? { tools } : {}),
		};
	}

	async function readRequestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
	}

	function writeEmptySseResponse(response: ServerResponse): void {
		response.writeHead(200, { "content-type": "text/event-stream" });
		response.end();
	}

	async function captureAnthropicRequest(context: Context): Promise<CapturedRequest> {
		let capturedRequest: CapturedRequest | undefined;

		const server = createServer(async (request, response) => {
			capturedRequest = {
				headers: request.headers,
				body: await readRequestBody(request),
			};
			writeEmptySseResponse(response);
		});

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as AddressInfo;

		try {
			const stream = streamAnthropic(createModel(`http://127.0.0.1:${address.port}`), context, {
				apiKey: "test-key",
				cacheRetention: "none",
			});

			for await (const event of stream) {
				if (event.type === "done" || event.type === "error") break;
			}
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}

		if (!capturedRequest) {
			throw new Error("Anthropic request was not captured");
		}
		return capturedRequest;
	}

	function getFirstTool(body: Record<string, unknown>): Record<string, unknown> {
		const tools = body.tools;
		if (!Array.isArray(tools) || typeof tools[0] !== "object" || tools[0] === null) {
			throw new Error("Expected first tool in request body");
		}
		return tools[0] as Record<string, unknown>;
	}

	describe("Anthropic eager tool input streaming", () => {
		it("sends per-tool eager_input_streaming when tools are present", async () => {
			const request = await captureAnthropicRequest(createContext());

			expect(getFirstTool(request.body).eager_input_streaming).toBe(true);
			expect(request.headers["anthropic-beta"]).toBeUndefined();
		});

		it("does not send the anthropic-beta header when there are no tools", async () => {
			const request = await captureAnthropicRequest(createContext([]));

			expect(request.body.tools).toBeUndefined();
			expect(request.headers["anthropic-beta"]).toBeUndefined();
		});
	});
}

{
	interface AnthropicThinkingPayload {
		thinking?: { type: string; display?: string };
		output_config?: { effort?: string };
	}

	class PayloadCaptured extends Error {
		constructor() {
			super("payload captured");
			this.name = "PayloadCaptured";
		}
	}

	function makeContext(): Context {
		return {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
		};
	}

	function makeCustomModel(): Model<"anthropic-messages"> {
		return {
			// Id intentionally does not match any built-in substring. This mirrors
			// corporate proxy schemes such as `anthropic--claude-opus-latest`.
			id: "vendor--claude-opus-latest",
			name: "Vendor Proxy Opus Latest",
			api: "anthropic-messages",
			provider: "vendor-proxy",
			baseUrl: "http://127.0.0.1:9",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 32000,
		};
	}

	async function capturePayload(
		model: Model<"anthropic-messages">,
		options?: SimpleStreamOptions,
	): Promise<AnthropicThinkingPayload> {
		let capturedPayload: AnthropicThinkingPayload | undefined;

		const payloadCaptureModel: Model<"anthropic-messages"> = {
			...model,
			baseUrl: "http://127.0.0.1:9",
		};

		const s = streamSimple(payloadCaptureModel, makeContext(), {
			...options,
			apiKey: "fake-key",
			onPayload: (payload) => {
				capturedPayload = payload as AnthropicThinkingPayload;
				throw new PayloadCaptured();
			},
		});

		await s.result();

		if (!capturedPayload) {
			throw new Error("Expected payload to be captured before request failure");
		}

		return capturedPayload;
	}

	describe("Anthropic adaptive thinking", () => {
		it("sends adaptive thinking payload for custom model ids", async () => {
			const payload = await capturePayload(makeCustomModel(), { reasoning: "medium" });

			expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
			expect(payload.output_config).toEqual({ effort: "medium" });
		});

		it("uses adaptive thinking with native xhigh effort for Claude Fable 5", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-fable-5"), { reasoning: "xhigh" });

			expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
			expect(payload.output_config).toEqual({ effort: "xhigh" });
		});

		it("uses adaptive thinking for built-in Claude Opus 4.8", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-8"), { reasoning: "medium" });

			expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
			expect(payload.output_config).toEqual({ effort: "medium" });
		});

		it("preserves thinking.type=disabled when reasoning is off", async () => {
			const payload = await capturePayload(makeCustomModel());

			expect(payload.thinking).toEqual({ type: "disabled" });
			expect(payload.output_config).toBeUndefined();
		});
	});
}

{
	function jsonResponse(body: unknown, status: number = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	function getUrl(input: unknown): string {
		if (typeof input === "string") {
			return input;
		}
		if (input instanceof URL) {
			return input.toString();
		}
		if (input instanceof Request) {
			return input.url;
		}
		throw new Error(`Unsupported fetch input: ${String(input)}`);
	}

	function getJsonBody(init?: RequestInit): Record<string, string> {
		if (typeof init?.body !== "string") {
			throw new Error(`Expected string request body, got ${typeof init?.body}`);
		}
		return JSON.parse(init.body) as Record<string, string>;
	}

	describe.sequential("Anthropic OAuth", () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("keeps the localhost redirect_uri for manual callback login", async () => {
			let authUrl = "";
			const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
				expect(getUrl(input)).toBe("https://platform.claude.com/v1/oauth/token");
				expect(init?.method).toBe("POST");
				const body = getJsonBody(init);
				expect(body.grant_type).toBe("authorization_code");
				expect(body.code).toBe("manual-code");
				expect(body.redirect_uri).toBe("http://localhost:53692/callback");
				return jsonResponse({
					access_token: "access-token",
					refresh_token: "refresh-token",
					expires_in: 3600,
				});
			});
			vi.stubGlobal("fetch", fetchMock);

			const credentials = await loginAnthropic({
				onAuth: (info) => {
					authUrl = info.url;
				},
				onPrompt: async () => "",
				onManualCodeInput: async () => {
					const url = new URL(authUrl);
					const state = url.searchParams.get("state");
					const redirectUri = url.searchParams.get("redirect_uri");
					if (!state || !redirectUri) {
						throw new Error("Missing OAuth state or redirect_uri in auth URL");
					}
					return `${redirectUri}?code=manual-code&state=${state}`;
				},
			});

			expect(credentials.access).toBe("access-token");
			expect(credentials.refresh).toBe("refresh-token");
			expect(fetchMock).toHaveBeenCalledOnce();
		});

		it("omits scope from refresh token requests", async () => {
			const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
				expect(getUrl(input)).toBe("https://platform.claude.com/v1/oauth/token");
				expect(init?.method).toBe("POST");
				const body = getJsonBody(init);
				expect(body.grant_type).toBe("refresh_token");
				expect(body.client_id).toBeTruthy();
				expect(body.refresh_token).toBe("refresh-token");
				expect(body).not.toHaveProperty("scope");
				return jsonResponse({
					access_token: "new-access-token",
					refresh_token: "new-refresh-token",
					expires_in: 3600,
				});
			});
			vi.stubGlobal("fetch", fetchMock);

			const credentials = await refreshAnthropicToken("refresh-token");

			expect(credentials.access).toBe("new-access-token");
			expect(credentials.refresh).toBe("new-refresh-token");
			expect(fetchMock).toHaveBeenCalledOnce();
		});
	});
}

{
	function createSseResponse(events: Array<{ event: string; data: string }>): Response {
		const body = events.map(({ event, data }) => `event: ${event}\ndata: ${data}\n`).join("\n");
		return new Response(body, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	}

	const minimalAnthropicEvents = [
		{
			event: "message_start",
			data: JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: {
						input_tokens: 12,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			}),
		},
		{
			event: "content_block_start",
			data: JSON.stringify({
				type: "content_block_start",
				index: 0,
				content_block: { type: "text", text: "" },
			}),
		},
		{
			event: "content_block_delta",
			data: JSON.stringify({
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "Hello" },
			}),
		},
		{
			event: "content_block_stop",
			data: JSON.stringify({ type: "content_block_stop", index: 0 }),
		},
		{
			event: "message_delta",
			data: JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: {
					input_tokens: 12,
					output_tokens: 5,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			}),
		},
		{
			event: "message_stop",
			data: JSON.stringify({ type: "message_stop" }),
		},
	];

	function createFakeAnthropicClient(response: Response): Anthropic {
		return {
			messages: {
				create: () => ({
					asResponse: async () => response,
				}),
			},
		} as unknown as Anthropic;
	}

	describe("Anthropic raw SSE parsing", () => {
		it("repairs malformed SSE JSON and malformed streamed tool JSON", async () => {
			const model = getModel("anthropic", "claude-haiku-4-5");
			const context: Context = {
				messages: [{ role: "user", content: "Use the edit tool.", timestamp: Date.now() }],
				tools: [
					{
						name: "edit",
						description: "Edit a file.",
						parameters: Type.Object({
							path: Type.String(),
							text: Type.String(),
						}),
					},
				],
			};

			const malformedToolJsonDelta = String.raw`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"A\H\",\"text\":\"col1	col2\"}"}}`;

			const response = createSseResponse([
				{
					event: "message_start",
					data: JSON.stringify({
						type: "message_start",
						message: {
							id: "msg_test",
							usage: {
								input_tokens: 12,
								output_tokens: 0,
								cache_read_input_tokens: 0,
								cache_creation_input_tokens: 0,
							},
						},
					}),
				},
				{
					event: "content_block_start",
					data: JSON.stringify({
						type: "content_block_start",
						index: 0,
						content_block: {
							type: "tool_use",
							id: "toolu_test",
							name: "edit",
							input: {},
						},
					}),
				},
				{ event: "content_block_delta", data: malformedToolJsonDelta },
				{
					event: "content_block_stop",
					data: JSON.stringify({ type: "content_block_stop", index: 0 }),
				},
				{
					event: "message_delta",
					data: JSON.stringify({
						type: "message_delta",
						delta: { stop_reason: "tool_use" },
						usage: {
							input_tokens: 12,
							output_tokens: 5,
							cache_read_input_tokens: 0,
							cache_creation_input_tokens: 0,
						},
					}),
				},
				{
					event: "message_stop",
					data: JSON.stringify({ type: "message_stop" }),
				},
			]);

			const stream = streamAnthropic(model, context, {
				client: createFakeAnthropicClient(response),
			});
			const result = await stream.result();

			expect(result.stopReason).toBe("toolUse");
			expect(result.errorMessage).toBeUndefined();

			const toolCall = result.content.find((block): block is ToolCall => block.type === "toolCall");
			expect(toolCall).toBeDefined();
			expect(toolCall?.arguments).toEqual({
				path: "A\\H",
				text: "col1\tcol2",
			});
		});

		it("preserves refusal stop details from message_delta", async () => {
			const model = getModel("anthropic", "claude-fable-5");
			const context: Context = {
				messages: [{ role: "user", content: "blocked request", timestamp: Date.now() }],
			};
			const explanation =
				"This request triggered restrictions on violative cyber content and was blocked under Anthropic's Usage Policy. To learn more, provide feedback, or request an exemption based on how you use Claude, visit our help center: https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude.";
			const response = createSseResponse([
				{
					event: "message_start",
					data: JSON.stringify({
						type: "message_start",
						message: {
							id: "msg_01XFUDYJgAACzvnptvVoYEL",
							usage: {
								input_tokens: 412,
								output_tokens: 0,
								cache_read_input_tokens: 0,
								cache_creation_input_tokens: 0,
							},
						},
					}),
				},
				{
					event: "message_delta",
					data: JSON.stringify({
						type: "message_delta",
						delta: {
							stop_reason: "refusal",
							stop_details: {
								type: "refusal",
								category: "cyber",
								explanation,
							},
						},
						usage: {
							input_tokens: 412,
							output_tokens: 0,
							cache_read_input_tokens: 0,
							cache_creation_input_tokens: 0,
						},
					}),
				},
				{
					event: "message_stop",
					data: JSON.stringify({ type: "message_stop" }),
				},
			]);

			const stream = streamAnthropic(model, context, {
				client: createFakeAnthropicClient(response),
			});
			const result = await stream.result();

			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toBe(explanation);
		});

		it("ignores unknown SSE events after message_stop", async () => {
			const model = getModel("anthropic", "claude-haiku-4-5");
			const context: Context = {
				messages: [{ role: "user", content: "Say hello.", timestamp: Date.now() }],
			};
			const response = createSseResponse([
				...minimalAnthropicEvents,
				{ event: "done", data: "[DONE]" },
				{ event: "proxy.stats", data: "not json" },
			]);

			const stream = streamAnthropic(model, context, {
				client: createFakeAnthropicClient(response),
			});
			const result = await stream.result();

			expect(result.stopReason).toBe("stop");
			expect(result.errorMessage).toBeUndefined();
			expect(result.content).toEqual([{ type: "text", text: "Hello" }]);
		});
	});
}

{
	interface AnthropicTemperaturePayload {
		temperature?: number;
	}

	class PayloadCaptured extends Error {
		constructor() {
			super("payload captured");
			this.name = "PayloadCaptured";
		}
	}

	function makeContext(): Context {
		return {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
		};
	}

	function makeCustomModel(compat?: Model<"anthropic-messages">["compat"]): Model<"anthropic-messages"> {
		return {
			id: "vendor--claude-opus-4-7",
			name: "Vendor Proxy Opus 4.7",
			api: "anthropic-messages",
			provider: "vendor-proxy",
			baseUrl: "http://127.0.0.1:9",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 32000,
			compat,
		};
	}

	async function capturePayload(
		model: Model<"anthropic-messages">,
		options?: SimpleStreamOptions,
	): Promise<AnthropicTemperaturePayload> {
		let capturedPayload: AnthropicTemperaturePayload | undefined;

		const payloadCaptureModel: Model<"anthropic-messages"> = {
			...model,
			baseUrl: "http://127.0.0.1:9",
		};

		const s = streamSimple(payloadCaptureModel, makeContext(), {
			...options,
			apiKey: "fake-key",
			onPayload: (payload) => {
				capturedPayload = payload as AnthropicTemperaturePayload;
				throw new PayloadCaptured();
			},
		});

		await s.result();

		if (!capturedPayload) {
			throw new Error("Expected payload to be captured before request failure");
		}

		return capturedPayload;
	}

	describe("Anthropic temperature compatibility", () => {
		it("omits temperature for Claude Opus 4.7", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-7"), { temperature: 0 });

			expect(payload.temperature).toBeUndefined();
		});

		it("omits temperature for Claude Opus 4.8", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-8"), { temperature: 0 });

			expect(payload.temperature).toBeUndefined();
		});

		it("omits default temperature for Claude Opus 4.7", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-7"), { temperature: 1 });

			expect(payload.temperature).toBeUndefined();
		});

		it("keeps temperature for Claude Opus 4.6", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-6"), { temperature: 0 });

			expect(payload.temperature).toBe(0);
		});

		it("keeps temperature for Claude Sonnet 4.6", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-sonnet-4-6"), { temperature: 0 });

			expect(payload.temperature).toBe(0);
		});

		it("omits temperature for custom models with supportsTemperature disabled", async () => {
			const payload = await capturePayload(makeCustomModel({ supportsTemperature: false }), { temperature: 0 });

			expect(payload.temperature).toBeUndefined();
		});
	});
}

{
	interface AnthropicThinkingPayload {
		thinking?: { type: string; budget_tokens?: number; display?: string };
		output_config?: { effort?: string };
	}

	class PayloadCaptured extends Error {
		constructor() {
			super("payload captured");
			this.name = "PayloadCaptured";
		}
	}

	function makePayloadCaptureContext(): Context {
		return {
			messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
		};
	}

	async function capturePayload(
		model: Model<"anthropic-messages">,
		options?: SimpleStreamOptions,
	): Promise<AnthropicThinkingPayload> {
		let capturedPayload: AnthropicThinkingPayload | undefined;
		const payloadCaptureModel: Model<"anthropic-messages"> = {
			...model,
			baseUrl: "http://127.0.0.1:9",
		};

		const s = streamSimple(payloadCaptureModel, makePayloadCaptureContext(), {
			...options,
			apiKey: "fake-key",
			onPayload: (payload) => {
				capturedPayload = payload as AnthropicThinkingPayload;
				throw new PayloadCaptured();
			},
		});

		await s.result();

		if (!capturedPayload) {
			throw new Error("Expected payload to be captured before request failure");
		}

		return capturedPayload;
	}

	describe("Anthropic thinking disable payload", () => {
		it("sends thinking.type=disabled for budget-based reasoning models when thinking is off", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-sonnet-4-5"));

			expect(payload.thinking).toEqual({ type: "disabled" });
			expect(payload.output_config).toBeUndefined();
		});

		it("sends thinking.type=disabled for adaptive reasoning models when thinking is off", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-6"));

			expect(payload.thinking).toEqual({ type: "disabled" });
			expect(payload.output_config).toBeUndefined();
		});

		it("sends thinking.type=disabled for Claude Opus 4.8 when thinking is off", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-8"));

			expect(payload.thinking).toEqual({ type: "disabled" });
			expect(payload.output_config).toBeUndefined();
		});

		it("omits thinking.type=disabled for Claude Fable 5 when thinking is off", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-fable-5"));

			expect(payload.thinking).toBeUndefined();
			expect(payload.output_config).toBeUndefined();
		});

		it("uses adaptive thinking for Claude Opus 4.8 when reasoning is enabled", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-8"), { reasoning: "high" });

			expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
			expect(payload.output_config).toEqual({ effort: "high" });
		});

		it("maps xhigh reasoning to effort=xhigh for Claude Opus 4.8", async () => {
			const payload = await capturePayload(getModel("anthropic", "claude-opus-4-8"), { reasoning: "xhigh" });

			expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
			expect(payload.output_config).toEqual({ effort: "xhigh" });
		});
	});
}
