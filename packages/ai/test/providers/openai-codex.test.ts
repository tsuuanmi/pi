import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	loginOpenAICodexDeviceCode,
	openaiCodexOAuthProvider,
	refreshOpenAICodexToken,
} from "#ai/auth/oauth/openai-codex";
import {
	getOpenAICodexWebSocketDebugStats,
	resetOpenAICodexWebSocketDebugStats,
	streamOpenAICodexResponses,
	streamSimpleOpenAICodexResponses,
} from "#ai/providers/openai/codex-responses";
import type { Context, Model } from "#ai/types";

// From openai-codex-oauth.test.ts
{
	function jsonResponse(body: unknown, status: number = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}

	function getUrl(input: unknown): string {
		if (typeof input === "string") return input;
		if (input instanceof URL) return input.toString();
		if (input instanceof Request) return input.url;
		throw new Error(`Unsupported fetch input: ${String(input)}`);
	}

	function createAccessToken(accountId: string): string {
		const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64");
		const payload = Buffer.from(
			JSON.stringify({
				"https://api.openai.com/auth": {
					chatgpt_account_id: accountId,
				},
			}),
		).toString("base64");
		return `${header}.${payload}.signature`;
	}

	function deviceAuthPendingResponse(): Response {
		return jsonResponse(
			{
				error: {
					message: "Device authorization is pending. Please try again.",
					type: "invalid_request_error",
					param: null,
					code: "deviceauth_authorization_pending",
				},
			},
			403,
		);
	}

	describe("OpenAI Codex OAuth", () => {
		afterEach(() => {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
			vi.useRealTimers();
		});

		it("logs in with the OpenAI Codex device code flow", async () => {
			vi.useFakeTimers();
			const startTime = new Date("2026-05-20T00:00:00Z");
			vi.setSystemTime(startTime);

			const accessToken = createAccessToken("account-123");
			const deviceInfos: Array<{
				userCode: string;
				verificationUri: string;
				instructions?: string;
				intervalSeconds?: number;
				expiresInSeconds?: number;
			}> = [];
			const pollTimes: number[] = [];
			const pollResponses = [
				deviceAuthPendingResponse(),
				jsonResponse({
					authorization_code: "oauth-code",
					code_challenge: "device-code-challenge",
					code_verifier: "device-code-verifier",
				}),
			];

			const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
				const url = getUrl(input);

				if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
					expect(init?.method).toBe("POST");
					expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
					expect(JSON.parse(String(init?.body))).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
					return jsonResponse({
						device_auth_id: "device-auth-id",
						user_code: "ABCD-1234",
						interval: "5",
					});
				}

				if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
					pollTimes.push(Date.now());
					expect(init?.method).toBe("POST");
					expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
					expect(JSON.parse(String(init?.body))).toEqual({
						device_auth_id: "device-auth-id",
						user_code: "ABCD-1234",
					});
					const response = pollResponses.shift();
					if (!response) {
						throw new Error("Unexpected extra device auth poll");
					}
					return response;
				}

				if (url === "https://auth.openai.com/oauth/token") {
					expect(init?.method).toBe("POST");
					expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
					const params = new URLSearchParams(String(init?.body));
					expect(params.get("grant_type")).toBe("authorization_code");
					expect(params.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
					expect(params.get("code")).toBe("oauth-code");
					expect(params.get("redirect_uri")).toBe("https://auth.openai.com/deviceauth/callback");
					expect(params.get("code_verifier")).toBe("device-code-verifier");
					return jsonResponse({
						access_token: accessToken,
						refresh_token: "refresh-token",
						expires_in: 3600,
					});
				}

				throw new Error(`Unexpected fetch URL: ${url}`);
			});

			vi.stubGlobal("fetch", fetchMock);

			const credentialsPromise = loginOpenAICodexDeviceCode({
				onDeviceCode: (info) => deviceInfos.push(info),
			});

			for (let i = 0; i < 5 && pollTimes.length === 0; i++) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(deviceInfos).toEqual([
				{
					userCode: "ABCD-1234",
					verificationUri: "https://auth.openai.com/codex/device",
					intervalSeconds: 5,
					expiresInSeconds: 900,
				},
			]);
			expect(pollTimes).toEqual([startTime.getTime()]);

			await vi.advanceTimersByTimeAsync(4999);
			expect(pollTimes).toEqual([startTime.getTime()]);

			await vi.advanceTimersByTimeAsync(1);
			await expect(credentialsPromise).resolves.toMatchObject({
				access: accessToken,
				refresh: "refresh-token",
				expires: startTime.getTime() + 5000 + 3600 * 1000,
				accountId: "account-123",
			});
			expect(pollTimes).toEqual([startTime.getTime(), startTime.getTime() + 5000]);
		});

		it("offers browser login first and uses the selected OpenAI Codex device code flow", async () => {
			const accessToken = createAccessToken("account-456");
			const selectPrompts: Array<{
				message: string;
				options: Array<{ id: string; label: string }>;
			}> = [];
			const deviceInfos: Array<{
				userCode: string;
				verificationUri: string;
				intervalSeconds?: number;
				expiresInSeconds?: number;
			}> = [];

			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
					const url = getUrl(input);
					if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
						expect(JSON.parse(String(init?.body))).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
						return jsonResponse({
							device_auth_id: "device-auth-id",
							user_code: "WXYZ-7890",
							interval: "5",
						});
					}
					if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
						return jsonResponse({
							authorization_code: "oauth-code",
							code_challenge: "device-code-challenge",
							code_verifier: "device-code-verifier",
						});
					}
					if (url === "https://auth.openai.com/oauth/token") {
						return jsonResponse({
							access_token: accessToken,
							refresh_token: "refresh-token",
							expires_in: 3600,
						});
					}
					throw new Error(`Unexpected fetch URL: ${url}`);
				}),
			);

			await expect(
				openaiCodexOAuthProvider.login({
					onAuth: () => {
						throw new Error("Browser login should not start");
					},
					onDeviceCode: (info) => deviceInfos.push(info),
					onPrompt: async () => {
						throw new Error("Prompt should not be used");
					},
					onSelect: async (prompt) => {
						selectPrompts.push(prompt);
						return "device_code";
					},
				}),
			).resolves.toMatchObject({
				access: accessToken,
				refresh: "refresh-token",
				accountId: "account-456",
			});

			expect(selectPrompts).toEqual([
				{
					message: "Select OpenAI Codex login method:",
					options: [
						{ id: "browser", label: "Browser login (default)" },
						{ id: "device_code", label: "Device code login (headless)" },
					],
				},
			]);
			expect(deviceInfos).toEqual([
				{
					userCode: "WXYZ-7890",
					verificationUri: "https://auth.openai.com/codex/device",
					intervalSeconds: 5,
					expiresInSeconds: 900,
				},
			]);
		});

		it("cancels when OpenAI Codex login method selection is cancelled", async () => {
			await expect(
				openaiCodexOAuthProvider.login({
					onAuth: () => {},
					onDeviceCode: () => {},
					onPrompt: async () => "",
					onSelect: async () => undefined,
				}),
			).rejects.toThrow("Login cancelled");
		});

		it("cancels the OpenAI Codex device code flow while waiting", async () => {
			vi.useFakeTimers();
			const controller = new AbortController();
			const pollTimes: number[] = [];

			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
					const url = getUrl(input);
					if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
						expect(JSON.parse(String(init?.body))).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
						return jsonResponse({
							device_auth_id: "device-auth-id",
							user_code: "ABCD-1234",
							interval: "5",
						});
					}
					if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
						pollTimes.push(Date.now());
						return deviceAuthPendingResponse();
					}
					throw new Error(`Unexpected fetch URL: ${url}`);
				}),
			);

			const credentialsPromise = loginOpenAICodexDeviceCode({
				onDeviceCode: () => {},
				signal: controller.signal,
			});
			const rejectionPromise = credentialsPromise.then(
				() => new Error("Expected login to fail"),
				(error: unknown) => error,
			);

			for (let i = 0; i < 5 && pollTimes.length === 0; i++) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(pollTimes).toHaveLength(1);

			controller.abort();
			const rejection = await rejectionPromise;
			expect(rejection).toBeInstanceOf(Error);
			expect((rejection as Error).message).toBe("Login cancelled");
		});

		it("times out the OpenAI Codex device code flow after 15 minutes", async () => {
			vi.useFakeTimers();
			const pollTimes: number[] = [];

			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
					const url = getUrl(input);
					if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
						expect(JSON.parse(String(init?.body))).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
						return jsonResponse({
							device_auth_id: "device-auth-id",
							user_code: "ABCD-1234",
							interval: "60",
						});
					}
					if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
						pollTimes.push(Date.now());
						return deviceAuthPendingResponse();
					}
					throw new Error(`Unexpected fetch URL: ${url}`);
				}),
			);

			const credentialsPromise = loginOpenAICodexDeviceCode({
				onDeviceCode: () => {},
			});
			const rejectionPromise = credentialsPromise.then(
				() => new Error("Expected login to fail"),
				(error: unknown) => error,
			);

			for (let i = 0; i < 5 && pollTimes.length === 0; i++) {
				await vi.advanceTimersByTimeAsync(0);
			}
			expect(pollTimes).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
			const rejection = await rejectionPromise;
			expect(rejection).toBeInstanceOf(Error);
			expect((rejection as Error).message).toBe("Device flow timed out");
		});

		it("treats OpenAI Codex device auth 403 and 404 responses as pending", async () => {
			vi.useFakeTimers();
			const accessToken = createAccessToken("account-403-404");
			const pollTimes: number[] = [];
			const pollResponses = [
				jsonResponse({ error: "access_denied", error_description: "denied" }, 403),
				new Response("not ready", { status: 404, headers: { "Content-Type": "text/plain" } }),
				jsonResponse({
					authorization_code: "oauth-code",
					code_challenge: "device-code-challenge",
					code_verifier: "device-code-verifier",
				}),
			];

			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: unknown): Promise<Response> => {
					const url = getUrl(input);
					if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
						return jsonResponse({
							device_auth_id: "device-auth-id",
							user_code: "ABCD-1234",
							interval: "1",
						});
					}
					if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
						pollTimes.push(Date.now());
						const response = pollResponses.shift();
						if (!response) {
							throw new Error("Unexpected extra device auth poll");
						}
						return response;
					}
					if (url === "https://auth.openai.com/oauth/token") {
						return jsonResponse({
							access_token: accessToken,
							refresh_token: "refresh-token",
							expires_in: 3600,
						});
					}
					throw new Error(`Unexpected fetch URL: ${url}`);
				}),
			);

			const credentialsPromise = loginOpenAICodexDeviceCode({
				onDeviceCode: () => {},
			});

			for (let i = 0; i < 5 && pollTimes.length === 0; i++) {
				await vi.advanceTimersByTimeAsync(0);
			}
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			await expect(credentialsPromise).resolves.toMatchObject({
				access: accessToken,
				refresh: "refresh-token",
				accountId: "account-403-404",
			});
			expect(pollTimes).toHaveLength(3);
		});

		it("includes the response body in OpenAI Codex device auth poll failures", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: unknown): Promise<Response> => {
					const url = getUrl(input);
					if (url === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
						return jsonResponse({
							device_auth_id: "device-auth-id",
							user_code: "ABCD-1234",
							interval: "5",
						});
					}
					if (url === "https://auth.openai.com/api/accounts/deviceauth/token") {
						return jsonResponse({ error: "server_error", error_description: "try again later" }, 500);
					}
					throw new Error(`Unexpected fetch URL: ${url}`);
				}),
			);

			await expect(
				loginOpenAICodexDeviceCode({
					onDeviceCode: () => {},
				}),
			).rejects.toThrow(
				'OpenAI Codex device auth failed with status 500: {"error":"server_error","error_description":"try again later"}',
			);
		});

		it("does not write token refresh failures to stderr", async () => {
			const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
			vi.stubGlobal(
				"fetch",
				vi.fn(async (): Promise<Response> => {
					return new Response(
						JSON.stringify({
							error: {
								message: "Could not validate your token. Please try signing in again.",
								type: "invalid_request_error",
							},
						}),
						{ status: 401, statusText: "Unauthorized", headers: { "Content-Type": "application/json" } },
					);
				}),
			);

			await expect(refreshOpenAICodexToken("invalid-refresh-token")).rejects.toThrow(
				/OpenAI Codex token refresh failed \(401\).*Could not validate your token/,
			);
			expect(consoleError).not.toHaveBeenCalled();
		});
	});
}

// From openai-codex-stream.test.ts
{
	const originalAgentDir = process.env.PI_AGENT_DIR;

	afterEach(() => {
		vi.unstubAllGlobals();
		if (originalAgentDir === undefined) {
			delete process.env.PI_AGENT_DIR;
		} else {
			process.env.PI_AGENT_DIR = originalAgentDir;
		}
		resetOpenAICodexWebSocketDebugStats();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function mockToken(): string {
		const payload = Buffer.from(
			JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
			"utf8",
		).toString("base64");
		return `aaa.${payload}.bbb`;
	}

	function buildSSEPayload({
		status,
		includeDone = false,
	}: {
		status: "completed" | "incomplete";
		includeDone?: boolean;
	}): string {
		const terminalType = status === "incomplete" ? "response.incomplete" : "response.completed";
		const events = [
			`data: ${JSON.stringify({
				type: "response.output_item.added",
				item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
			})}`,
			`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
			`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
			`data: ${JSON.stringify({
				type: "response.output_item.done",
				item: {
					type: "message",
					id: "msg_1",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: "Hello" }],
				},
			})}`,
			`data: ${JSON.stringify({
				type: terminalType,
				response: {
					status,
					incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
					usage: {
						input_tokens: 5,
						output_tokens: 3,
						total_tokens: 8,
						input_tokens_details: { cached_tokens: 0 },
					},
				},
			})}`,
		];

		if (includeDone) {
			events.push("data: [DONE]");
		}

		return `${events.join("\n\n")}\n\n`;
	}

	describe("openai-codex streaming", () => {
		it("streams SSE responses into AssistantMessageEventStream", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;

			const payload = Buffer.from(
				JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
				"utf8",
			).toString("base64");
			const token = `aaa.${payload}.bbb`;

			const sse = `${[
				`data: ${JSON.stringify({
					type: "response.output_item.added",
					item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
				})}`,
				`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
				`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
				`data: ${JSON.stringify({
					type: "response.output_item.done",
					item: {
						type: "message",
						id: "msg_1",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Hello" }],
					},
				})}`,
				`data: ${JSON.stringify({
					type: "response.completed",
					response: {
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
							input_tokens_details: { cached_tokens: 0 },
						},
					},
				})}`,
			].join("\n\n")}\n\n`;

			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
					controller.close();
				},
			});

			const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					const headers = init?.headers instanceof Headers ? init.headers : undefined;
					expect(headers?.get("Authorization")).toBe(`Bearer ${token}`);
					expect(headers?.get("chatgpt-account-id")).toBe("acc_test");
					expect(headers?.get("OpenAI-Beta")).toBe("responses=experimental");
					expect(headers?.get("originator")).toBe("pi");
					expect(headers?.get("accept")).toBe("text/event-stream");
					expect(headers?.has("x-api-key")).toBe(false);
					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});

			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const streamResult = streamOpenAICodexResponses(model, context, { apiKey: token, transport: "sse" });
			let sawTextDelta = false;
			let sawDone = false;

			for await (const event of streamResult) {
				if (event.type === "text_delta") {
					sawTextDelta = true;
				}
				if (event.type === "done") {
					sawDone = true;
					expect(event.message.content.find((c) => c.type === "text")?.text).toBe("Hello");
				}
			}

			expect(sawTextDelta).toBe(true);
			expect(sawDone).toBe(true);
		});

		it("completes after response.completed even when the SSE body stays open", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;
			const token = mockToken();
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "completed", includeDone: true });

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
				},
			});

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const result = await Promise.race([
				streamOpenAICodexResponses(model, context, { apiKey: token, transport: "sse" }).result(),
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error("Timed out waiting for completed SSE stream")), 1000);
				}),
			]);

			expect(result.content.find((c) => c.type === "text")?.text).toBe("Hello");
			expect(result.stopReason).toBe("stop");
		});

		it("maps response.incomplete to stopReason length even when the SSE body stays open", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;
			const token = mockToken();
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "incomplete" });

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
				},
			});

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const result = await Promise.race([
				streamOpenAICodexResponses(model, context, { apiKey: token, transport: "sse" }).result(),
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error("Timed out waiting for incomplete SSE stream")), 1000);
				}),
			]);

			expect(result.content.find((c) => c.type === "text")?.text).toBe("Hello");
			expect(result.stopReason).toBe("length");
		});

		it("aborts SSE fetch when response headers do not arrive", async () => {
			vi.useFakeTimers();
			const token = mockToken();

			const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url !== "https://chatgpt.com/backend-api/codex/responses") {
					throw new Error(`Unexpected URL: ${url}`);
				}

				const signal = init?.signal;
				if (!signal) {
					throw new Error("Expected SSE fetch to receive an abort signal");
				}

				return new Promise<Response>((_, reject) => {
					const onAbort = () => {
						const reason = signal.reason;
						reject(reason instanceof Error ? reason : new Error("SSE fetch aborted"));
					};
					if (signal.aborted) {
						onAbort();
						return;
					}
					signal.addEventListener("abort", onAbort, { once: true });
				});
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "sse",
			}).result();
			let settled = false;
			const observedResultPromise = resultPromise.then((result) => {
				settled = true;
				return result;
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(10_000);
			expect(settled).toBe(false);

			await vi.advanceTimersByTimeAsync(10_000);
			const result = await observedResultPromise;
			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toBe("Codex SSE response headers timed out after 20000ms");
		});

		it("aborts SSE body reads after response headers arrive", async () => {
			const token = mockToken();
			const encoder = new TextEncoder();
			const timers: ReturnType<typeof setTimeout>[] = [];
			let cancelled = false;
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					const enqueue = (chunk: string) => {
						if (!cancelled) controller.enqueue(encoder.encode(chunk));
					};
					enqueue(
						`${[
							`data: ${JSON.stringify({
								type: "response.output_item.added",
								item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
							})}`,
							`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
							`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "one" })}`,
						].join("\n\n")}\n\n`,
					);
					timers.push(
						setTimeout(() => {
							enqueue(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "two" })}\n\n`);
						}, 10),
					);
					timers.push(
						setTimeout(() => {
							if (cancelled) return;
							enqueue(
								`${[
									`data: ${JSON.stringify({
										type: "response.output_item.done",
										item: {
											type: "message",
											id: "msg_1",
											role: "assistant",
											status: "completed",
											content: [{ type: "output_text", text: "onetwo" }],
										},
									})}`,
									`data: ${JSON.stringify({
										type: "response.completed",
										response: {
											status: "completed",
											usage: {
												input_tokens: 5,
												output_tokens: 3,
												total_tokens: 8,
												input_tokens_details: { cached_tokens: 0 },
											},
										},
									})}`,
								].join("\n\n")}\n\n`,
							);
							controller.close();
						}, 20),
					);
				},
				cancel() {
					cancelled = true;
					for (const timer of timers) clearTimeout(timer);
				},
			});

			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } })),
			);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};
			const controller = new AbortController();
			const events: string[] = [];

			const resultStream = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "sse",
				signal: controller.signal,
			});
			for await (const event of resultStream) {
				events.push(event.type === "text_delta" ? `text_delta:${event.delta}` : event.type);
				if (event.type === "text_delta" && event.delta === "one") {
					controller.abort();
				}
			}

			const result = await resultStream.result();
			expect(result.stopReason).toBe("aborted");
			expect(result.errorMessage).toBe("Request was aborted");
			expect(events).toContain("text_delta:one");
			expect(events).not.toContain("text_delta:two");
			expect(cancelled).toBe(true);
		});

		it("sets session-id/x-client-request-id headers and prompt_cache_key when sessionId is provided", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;

			const payload = Buffer.from(
				JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
				"utf8",
			).toString("base64");
			const token = `aaa.${payload}.bbb`;

			const sse = `${[
				`data: ${JSON.stringify({
					type: "response.output_item.added",
					item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
				})}`,
				`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
				`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
				`data: ${JSON.stringify({
					type: "response.output_item.done",
					item: {
						type: "message",
						id: "msg_1",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Hello" }],
					},
				})}`,
				`data: ${JSON.stringify({
					type: "response.completed",
					response: {
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
							input_tokens_details: { cached_tokens: 0 },
						},
					},
				})}`,
			].join("\n\n")}\n\n`;

			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
					controller.close();
				},
			});

			const sessionId = "test-session-123";
			const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					const headers = init?.headers instanceof Headers ? init.headers : undefined;
					// Verify sessionId is set in headers
					expect(headers?.get("session-id")).toBe(sessionId);
					expect(headers?.has("session_id")).toBe(false);
					expect(headers?.get("x-client-request-id")).toBe(sessionId);

					// Verify sessionId is set in request body as prompt_cache_key
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
					expect(body?.prompt_cache_key).toBe(sessionId);

					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});

			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const streamResult = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				sessionId,
				transport: "sse",
			});
			await streamResult.result();
		});

		it("clamps prompt_cache_key to OpenAI's 64-character limit", async () => {
			const token = mockToken();
			const sessionId = "x".repeat(67);
			let capturedPayload: { prompt_cache_key?: string } | undefined;
			const encoder = new TextEncoder();
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () =>
						new Response(
							new ReadableStream<Uint8Array>({
								start(controller) {
									controller.enqueue(encoder.encode(buildSSEPayload({ status: "completed" })));
									controller.close();
								},
							}),
							{ status: 200, headers: { "content-type": "text/event-stream" } },
						),
				),
			);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			await streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "sse",
				sessionId,
				onPayload: (payload) => {
					capturedPayload = payload as { prompt_cache_key?: string };
				},
			}).result();

			expect(capturedPayload?.prompt_cache_key).toBe("x".repeat(64));
		});

		it("preserves gpt-5.5 xhigh reasoning effort from simple options", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;
			const token = mockToken();
			const sse = buildSSEPayload({ status: "completed" });
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
					controller.close();
				},
			});
			let requestedReasoning: unknown;

			const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
					requestedReasoning = body?.reasoning;
					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.5",
				name: "GPT-5.5",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				thinkingLevelMap: { xhigh: "xhigh" },
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			await streamSimpleOpenAICodexResponses(model, context, {
				apiKey: token,
				reasoning: "xhigh",
				transport: "sse",
			}).result();

			expect(requestedReasoning).toEqual({ effort: "xhigh", summary: "auto" });
		});

		it.each(["gpt-5.3-codex", "gpt-5.4", "gpt-5.5"])("clamps %s minimal reasoning effort to low", async (modelId) => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;

			const payload = Buffer.from(
				JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
				"utf8",
			).toString("base64");
			const token = `aaa.${payload}.bbb`;

			const sse = `${[
				`data: ${JSON.stringify({
					type: "response.output_item.added",
					item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
				})}`,
				`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
				`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
				`data: ${JSON.stringify({
					type: "response.output_item.done",
					item: {
						type: "message",
						id: "msg_1",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Hello" }],
					},
				})}`,
				`data: ${JSON.stringify({
					type: "response.completed",
					response: {
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
							input_tokens_details: { cached_tokens: 0 },
						},
					},
				})}`,
			].join("\n\n")}\n\n`;

			let requestedReasoning: unknown;
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
					controller.close();
				},
			});

			const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
					requestedReasoning = body?.reasoning;

					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});

			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: modelId,
				name: modelId,
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				thinkingLevelMap: { minimal: "low" },
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const streamResult = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				reasoningEffort: "minimal",
				transport: "sse",
			});
			await streamResult.result();
			expect(requestedReasoning).toEqual({ effort: "low", summary: "auto" });
		});

		it.each([
			["gpt-5.1-codex", "flex", 0.5],
			["gpt-5.1-codex", "priority", 2],
			["gpt-5.5", "flex", 0.5],
			["gpt-5.5", "priority", 2.5],
		] as const)(
			"uses the client-sent %s service tier for %s when Codex echoes default",
			async (modelId, serviceTier, multiplier) => {
				const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
				process.env.PI_AGENT_DIR = tempDir;
				const token = mockToken();
				const sse = `${[
					`data: ${JSON.stringify({
						type: "response.output_item.added",
						item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
					})}`,
					`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
					`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
					`data: ${JSON.stringify({
						type: "response.output_item.done",
						item: {
							type: "message",
							id: "msg_1",
							role: "assistant",
							status: "completed",
							content: [{ type: "output_text", text: "Hello" }],
						},
					})}`,
					`data: ${JSON.stringify({
						type: "response.completed",
						response: {
							status: "completed",
							service_tier: "default",
							usage: {
								input_tokens: 1000000,
								output_tokens: 1000000,
								total_tokens: 2000000,
								input_tokens_details: { cached_tokens: 0 },
							},
						},
					})}`,
				].join("\n\n")}\n\n`;

				const encoder = new TextEncoder();
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(encoder.encode(sse));
						controller.close();
					},
				});

				const fetchMock = vi.fn(async (input: string | URL) => {
					const url = typeof input === "string" ? input : input.toString();
					if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
						return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
					}
					if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
						return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
					}
					if (url === "https://chatgpt.com/backend-api/codex/responses") {
						return new Response(stream, {
							status: 200,
							headers: { "content-type": "text/event-stream" },
						});
					}
					return new Response("not found", { status: 404 });
				});
				vi.stubGlobal("fetch", fetchMock);

				const model: Model<"openai-codex-responses"> = {
					id: modelId,
					name: modelId === "gpt-5.5" ? "GPT-5.5" : "GPT-5.1 Codex",
					api: "openai-codex-responses",
					provider: "openai-codex",
					baseUrl: "https://chatgpt.com/backend-api",
					reasoning: true,
					input: ["text"],
					cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 400000,
					maxTokens: 128000,
				};

				const context: Context = {
					systemPrompt: "You are a helpful assistant.",
					messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
				};

				const result = await streamOpenAICodexResponses(model, context, {
					apiKey: token,
					serviceTier,
					transport: "sse",
				}).result();

				expect(result.usage.cost.input).toBe(1 * multiplier);
				expect(result.usage.cost.output).toBe(2 * multiplier);
				expect(result.usage.cost.total).toBe(3 * multiplier);
			},
		);

		it("does not set session-id/x-client-request-id headers when sessionId is not provided", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "pi-codex-stream-"));
			process.env.PI_AGENT_DIR = tempDir;

			const payload = Buffer.from(
				JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acc_test" } }),
				"utf8",
			).toString("base64");
			const token = `aaa.${payload}.bbb`;

			const sse = `${[
				`data: ${JSON.stringify({
					type: "response.output_item.added",
					item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
				})}`,
				`data: ${JSON.stringify({ type: "response.content_part.added", part: { type: "output_text", text: "" } })}`,
				`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
				`data: ${JSON.stringify({
					type: "response.output_item.done",
					item: {
						type: "message",
						id: "msg_1",
						role: "assistant",
						status: "completed",
						content: [{ type: "output_text", text: "Hello" }],
					},
				})}`,
				`data: ${JSON.stringify({
					type: "response.completed",
					response: {
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
							input_tokens_details: { cached_tokens: 0 },
						},
					},
				})}`,
			].join("\n\n")}\n\n`;

			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode(sse));
					controller.close();
				},
			});

			const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url === "https://api.github.com/repos/openai/codex/releases/latest") {
					return new Response(JSON.stringify({ tag_name: "rust-v0.0.0" }), { status: 200 });
				}
				if (url.startsWith("https://raw.githubusercontent.com/openai/codex/")) {
					return new Response("PROMPT", { status: 200, headers: { etag: '"etag"' } });
				}
				if (url === "https://chatgpt.com/backend-api/codex/responses") {
					const headers = init?.headers instanceof Headers ? init.headers : undefined;
					// Verify headers are not set when sessionId is not provided
					expect(headers?.has("session-id")).toBe(false);
					expect(headers?.has("session_id")).toBe(false);
					expect(headers?.has("x-client-request-id")).toBe(false);

					return new Response(stream, {
						status: 200,
						headers: { "content-type": "text/event-stream" },
					});
				}
				return new Response("not found", { status: 404 });
			});

			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};

			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			// No sessionId provided
			const streamResult = streamOpenAICodexResponses(model, context, { apiKey: token, transport: "sse" });
			await streamResult.result();
		});
		it("forwards auto transport from streamSimple options and uses cached websocket context", async () => {
			const token = mockToken();
			const sentBodies: unknown[] = [];
			let capturedWebSocketHeaders: Record<string, string> | undefined;

			const fetchMock = vi.fn(async () => new Response("unexpected fetch", { status: 500 }));
			vi.stubGlobal("fetch", fetchMock);

			class MockWebSocket {
				private listeners = new Map<string, Set<(event: unknown) => void>>();

				constructor(_url: string, protocols?: string | string[] | { headers?: Record<string, string> }) {
					if (protocols && typeof protocols === "object" && !Array.isArray(protocols)) {
						capturedWebSocketHeaders = protocols.headers;
					}
					queueMicrotask(() => this.dispatch("open", {}));
				}

				addEventListener(type: string, listener: (event: unknown) => void): void {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				removeEventListener(type: string, listener: (event: unknown) => void): void {
					this.listeners.get(type)?.delete(listener);
				}

				send(data: string): void {
					sentBodies.push(JSON.parse(data));
					const events = [
						{
							type: "response.output_item.added",
							item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
						},
						{ type: "response.content_part.added", part: { type: "output_text", text: "" } },
						{ type: "response.output_text.delta", delta: "Hello" },
						{
							type: "response.output_item.done",
							item: {
								type: "message",
								id: "msg_1",
								role: "assistant",
								status: "completed",
								content: [{ type: "output_text", text: "Hello" }],
							},
						},
						{
							type: "response.completed",
							response: {
								status: "completed",
								usage: {
									input_tokens: 5,
									output_tokens: 3,
									total_tokens: 8,
									input_tokens_details: { cached_tokens: 0 },
								},
							},
						},
					];
					queueMicrotask(() => {
						for (const event of events) {
							this.dispatch("message", { data: JSON.stringify(event) });
						}
					});
				}

				close(): void {}

				private dispatch(type: string, event: unknown): void {
					for (const listener of this.listeners.get(type) ?? []) {
						listener(event);
					}
				}
			}

			vi.stubGlobal("WebSocket", MockWebSocket);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
			};

			await streamSimpleOpenAICodexResponses(model, context, {
				apiKey: token,
				sessionId: "session-auto",
				transport: "auto",
			}).result();

			expect(sentBodies).toHaveLength(1);
			expect(capturedWebSocketHeaders?.["session-id"]).toBe("session-auto");
			expect(capturedWebSocketHeaders?.session_id).toBeUndefined();
			expect(capturedWebSocketHeaders?.["x-client-request-id"]).toBe("session-auto");
			expect(global.fetch).not.toHaveBeenCalled();
			expect(getOpenAICodexWebSocketDebugStats("session-auto")).toMatchObject({
				cachedContextRequests: 1,
				fullContextRequests: 1,
			});
		});

		it("falls back to SSE when websocket connect does not open before the connect timeout", async () => {
			vi.useFakeTimers();
			const token = mockToken();
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "completed" });

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url !== "https://chatgpt.com/backend-api/codex/responses") {
					throw new Error(`Unexpected URL: ${url}`);
				}

				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(encoder.encode(sse));
							controller.close();
						},
					}),
					{ status: 200, headers: { "content-type": "text/event-stream" } },
				);
			});
			vi.stubGlobal("fetch", fetchMock);

			class MockWebSocket {
				private listeners = new Map<string, Set<(event: unknown) => void>>();

				addEventListener(type: string, listener: (event: unknown) => void): void {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				removeEventListener(type: string, listener: (event: unknown) => void): void {
					this.listeners.get(type)?.delete(listener);
				}

				send(): void {
					throw new Error("send should not be called before websocket open");
				}

				close(): void {}
			}

			vi.stubGlobal("WebSocket", MockWebSocket);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
			};

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				sessionId: "ws-connect-timeout",
				transport: "auto",
				timeoutMs: 300_000,
				websocketConnectTimeoutMs: 50,
			}).result();

			await vi.advanceTimersByTimeAsync(50);

			const result = await resultPromise;
			expect(result.content.find((content) => content.type === "text")?.text).toBe("Hello");
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(getOpenAICodexWebSocketDebugStats("ws-connect-timeout")).toMatchObject({
				websocketFailures: 1,
				sseFallbacks: 1,
				websocketFallbackActive: true,
				lastWebSocketError: "WebSocket connect timeout after 50ms",
			});
		});

		it("falls back to SSE when a websocket is idle before the first event", async () => {
			vi.useFakeTimers();
			const token = mockToken();
			const sentBodies: unknown[] = [];
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "completed" });

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url !== "https://chatgpt.com/backend-api/codex/responses") {
					throw new Error(`Unexpected URL: ${url}`);
				}

				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(encoder.encode(sse));
							controller.close();
						},
					}),
					{ status: 200, headers: { "content-type": "text/event-stream" } },
				);
			});
			vi.stubGlobal("fetch", fetchMock);

			class MockWebSocket {
				static OPEN = 1;
				readyState = MockWebSocket.OPEN;
				private listeners = new Map<string, Set<(event: unknown) => void>>();

				constructor(_url: string, _protocols?: string | string[] | { headers?: Record<string, string> }) {
					queueMicrotask(() => this.dispatch("open", {}));
				}

				addEventListener(type: string, listener: (event: unknown) => void): void {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				removeEventListener(type: string, listener: (event: unknown) => void): void {
					this.listeners.get(type)?.delete(listener);
				}

				send(data: string): void {
					sentBodies.push(JSON.parse(data));
				}

				close(): void {
					this.readyState = 3;
				}

				private dispatch(type: string, event: unknown): void {
					for (const listener of this.listeners.get(type) ?? []) {
						listener(event);
					}
				}
			}

			vi.stubGlobal("WebSocket", MockWebSocket);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
			};

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				sessionId: "ws-idle-before-start",
				transport: "auto",
				timeoutMs: 50,
			}).result();

			await vi.advanceTimersByTimeAsync(0);
			expect(sentBodies).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(50);

			const result = await resultPromise;
			expect(result.content.find((content) => content.type === "text")?.text).toBe("Hello");
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(getOpenAICodexWebSocketDebugStats("ws-idle-before-start")).toMatchObject({
				websocketFailures: 1,
				sseFallbacks: 1,
				websocketFallbackActive: true,
			});
		});

		it("errors when a websocket is idle after the stream started", async () => {
			vi.useFakeTimers();
			const token = mockToken();

			const fetchMock = vi.fn(async () => new Response("unexpected fetch", { status: 500 }));
			vi.stubGlobal("fetch", fetchMock);

			class MockWebSocket {
				static OPEN = 1;
				readyState = MockWebSocket.OPEN;
				private listeners = new Map<string, Set<(event: unknown) => void>>();

				constructor(_url: string, _protocols?: string | string[] | { headers?: Record<string, string> }) {
					queueMicrotask(() => this.dispatch("open", {}));
				}

				addEventListener(type: string, listener: (event: unknown) => void): void {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				removeEventListener(type: string, listener: (event: unknown) => void): void {
					this.listeners.get(type)?.delete(listener);
				}

				send(): void {
					queueMicrotask(() => {
						this.dispatch("message", {
							data: JSON.stringify({
								type: "response.output_item.added",
								item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] },
							}),
						});
					});
				}

				close(): void {
					this.readyState = 3;
				}

				private dispatch(type: string, event: unknown): void {
					for (const listener of this.listeners.get(type) ?? []) {
						listener(event);
					}
				}
			}

			vi.stubGlobal("WebSocket", MockWebSocket);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
			};

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "auto",
				timeoutMs: 50,
			}).result();

			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(50);

			const result = await resultPromise;
			expect(result.stopReason).toBe("error");
			expect(result.errorMessage).toBe("WebSocket idle timeout after 50ms");
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("sends only response input deltas in websocket-cached mode", async () => {
			const token = mockToken();
			const sentBodies: unknown[] = [];
			const responses = [
				{ responseId: "resp_1", messageId: "msg_1", text: "Hello" },
				{ responseId: "resp_2", messageId: "msg_2", text: "Done" },
			];

			class MockWebSocket {
				static OPEN = 1;
				readyState = MockWebSocket.OPEN;
				private listeners = new Map<string, Set<(event: unknown) => void>>();

				constructor(_url: string, _protocols?: string | string[] | { headers?: Record<string, string> }) {
					queueMicrotask(() => this.dispatch("open", {}));
				}

				addEventListener(type: string, listener: (event: unknown) => void): void {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				removeEventListener(type: string, listener: (event: unknown) => void): void {
					this.listeners.get(type)?.delete(listener);
				}

				send(data: string): void {
					sentBodies.push(JSON.parse(data));
					const response = responses.shift();
					if (!response) throw new Error("unexpected websocket request");
					const events = [
						{ type: "response.created", response: { id: response.responseId } },
						{
							type: "response.output_item.added",
							item: {
								type: "message",
								id: response.messageId,
								role: "assistant",
								status: "in_progress",
								content: [],
							},
						},
						{ type: "response.content_part.added", part: { type: "output_text", text: "" } },
						{ type: "response.output_text.delta", delta: response.text },
						{
							type: "response.output_item.done",
							item: {
								type: "message",
								id: response.messageId,
								role: "assistant",
								status: "completed",
								content: [{ type: "output_text", text: response.text }],
							},
						},
						{
							type: "response.completed",
							response: {
								id: response.responseId,
								status: "completed",
								usage: {
									input_tokens: 5,
									output_tokens: 3,
									total_tokens: 8,
									input_tokens_details: { cached_tokens: 0 },
								},
							},
						},
					];
					queueMicrotask(() => {
						for (const event of events) {
							this.dispatch("message", { data: JSON.stringify(event) });
						}
					});
				}

				close(): void {
					this.readyState = 3;
				}

				private dispatch(type: string, event: unknown): void {
					for (const listener of this.listeners.get(type) ?? []) {
						listener(event);
					}
				}
			}

			vi.stubGlobal("WebSocket", MockWebSocket);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const firstContext: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: 1 }],
			};

			const first = await streamOpenAICodexResponses(model, firstContext, {
				apiKey: token,
				sessionId: "session-1",
				transport: "websocket-cached",
			}).result();

			const secondContext: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [...firstContext.messages, first, { role: "user", content: "Now finish", timestamp: 2 }],
			};
			await streamOpenAICodexResponses(model, secondContext, {
				apiKey: token,
				sessionId: "session-1",
				transport: "websocket-cached",
			}).result();

			expect(sentBodies).toHaveLength(2);
			const firstBody = sentBodies[0] as { input: unknown[]; previous_response_id?: string; store?: boolean };
			const secondBody = sentBodies[1] as { input: unknown[]; previous_response_id?: string; store?: boolean };
			expect(firstBody.store).toBe(false);
			expect(firstBody.previous_response_id).toBeUndefined();
			expect(firstBody.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "Say hello" }] }]);
			expect(secondBody.store).toBe(false);
			expect(secondBody.previous_response_id).toBe("resp_1");
			expect(secondBody.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "Now finish" }] }]);
			expect(getOpenAICodexWebSocketDebugStats("session-1")).toMatchObject({
				requests: 2,
				connectionsCreated: 1,
				connectionsReused: 1,
				cachedContextRequests: 2,
				storeTrueRequests: 0,
				fullContextRequests: 1,
				deltaRequests: 1,
				lastDeltaInputItems: 1,
				lastPreviousResponseId: "resp_1",
			});
		});

		it.each([
			["retry-after-ms", () => ({ "content-type": "application/json", "retry-after-ms": "1500" }), 1500],
			["retry-after seconds", () => ({ "content-type": "application/json", "retry-after": "60" }), 60_000],
			[
				"retry-after HTTP date",
				() => ({ "content-type": "application/json", "retry-after": new Date(Date.now() + 45_000).toUTCString() }),
				45_000,
			],
		] as const)("uses %s for SSE retries", async (_name, makeHeaders, expectedDelay) => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-05-13T00:00:00Z"));
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
			const token = mockToken();
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "completed" });
			let codexRequests = 0;

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url !== "https://chatgpt.com/backend-api/codex/responses") {
					throw new Error(`Unexpected URL: ${url}`);
				}

				codexRequests++;
				if (codexRequests === 1) {
					return new Response(
						JSON.stringify({ error: { code: "rate_limit_exceeded", message: "rate limited" } }),
						{
							status: 429,
							headers: makeHeaders(),
						},
					);
				}

				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(encoder.encode(sse));
							controller.close();
						},
					}),
					{ status: 200, headers: { "content-type": "text/event-stream" } },
				);
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "sse",
				maxRetries: 1,
			}).result();
			await vi.advanceTimersByTimeAsync(0);
			expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expectedDelay);

			await vi.advanceTimersToNextTimerAsync();
			const result = await resultPromise;
			expect(result.content.find((content) => content.type === "text")?.text).toBe("Hello");
			expect(codexRequests).toBe(2);
		});

		it("uses exponential backoff across repeated SSE retries without retry headers", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-05-13T00:00:00Z"));
			const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
			const token = mockToken();
			const encoder = new TextEncoder();
			const sse = buildSSEPayload({ status: "completed" });
			let codexRequests = 0;

			const fetchMock = vi.fn(async (input: string | URL) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url !== "https://chatgpt.com/backend-api/codex/responses") {
					throw new Error(`Unexpected URL: ${url}`);
				}

				codexRequests++;
				if (codexRequests <= 3) {
					return new Response(
						JSON.stringify({ error: { code: "rate_limit_exceeded", message: "rate limited" } }),
						{
							status: 429,
							headers: { "content-type": "application/json" },
						},
					);
				}

				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(encoder.encode(sse));
							controller.close();
						},
					}),
					{ status: 200, headers: { "content-type": "text/event-stream" } },
				);
			});
			vi.stubGlobal("fetch", fetchMock);

			const model: Model<"openai-codex-responses"> = {
				id: "gpt-5.1-codex",
				name: "GPT-5.1 Codex",
				api: "openai-codex-responses",
				provider: "openai-codex",
				baseUrl: "https://chatgpt.com/backend-api",
				reasoning: true,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 400000,
				maxTokens: 128000,
			};
			const context: Context = {
				systemPrompt: "You are a helpful assistant.",
				messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
			};

			const retryTimeoutDelays = () =>
				setTimeoutSpy.mock.calls
					.map((call) => call[1])
					.filter((delay): delay is number => delay === 1000 || delay === 2000 || delay === 4000);

			const resultPromise = streamOpenAICodexResponses(model, context, {
				apiKey: token,
				transport: "sse",
				maxRetries: 3,
			}).result();
			await vi.advanceTimersByTimeAsync(0);
			expect(retryTimeoutDelays()).toEqual([1000]);

			await vi.advanceTimersToNextTimerAsync();
			expect(retryTimeoutDelays()).toEqual([1000, 2000]);

			await vi.advanceTimersToNextTimerAsync();
			expect(retryTimeoutDelays()).toEqual([1000, 2000, 4000]);

			await vi.advanceTimersToNextTimerAsync();
			const result = await resultPromise;
			expect(result.content.find((content) => content.type === "text")?.text).toBe("Hello");
			expect(codexRequests).toBe(4);
		});
	});
}
