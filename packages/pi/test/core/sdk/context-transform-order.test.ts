import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@tsuuanmi/pi-agent";
import {
	type Api,
	type AssistantMessage,
	type Context,
	createAssistantMessageEventStream,
	type Model,
} from "@tsuuanmi/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "#pi/auth/auth-storage";
import { ModelRegistry } from "#pi/model/model-registry";
import { createAgentSession } from "#pi/sdk/sdk";
import { SessionManager } from "#pi/session/session-manager";
import { SettingsManager } from "#pi/settings/settings-manager";
import { DefaultResourceLoader } from "#pi/skills/resource-loader";

function createModel(): Model<Api> {
	return {
		id: "capture-model",
		name: "Capture Model",
		api: "openai-completions",
		provider: "capture-provider",
		baseUrl: "https://capture.invalid/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
	};
}

function doneStream(): ReturnType<typeof createAssistantMessageEventStream> {
	const stream = createAssistantMessageEventStream();
	const message: AssistantMessage = {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		api: "openai-completions",
		provider: "capture-provider",
		model: "capture-model",
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
	stream.end(message);
	return stream;
}

describe("SDK context transform ordering", () => {
	let tempDir: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-context-transform-order-"));
		cwd = join(tempDir, "project");
		agentDir = join(tempDir, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("runs extension context transforms before retained-context optimization", async () => {
		const model = createModel();
		const settingsManager = SettingsManager.inMemory({ retainedContext: { stripThinking: true } });
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-api-key");
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		let capturedContext: Context | undefined;
		let extensionSawRawThinking = false;

		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			streamSimple: (_model, context) => {
				capturedContext = context;
				return doneStream();
			},
		});

		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: [
				(pi) => {
					pi.on("context", (event) => {
						extensionSawRawThinking = event.messages.some(
							(message) =>
								message.role === "assistant" && message.content.some((block) => block.type === "thinking"),
						);
						const injected: AgentMessage = {
							role: "assistant",
							content: [
								{ type: "thinking", thinking: "extension reasoning" },
								{ type: "text", text: "extension text" },
							],
							api: "openai-completions",
							provider: "capture-provider",
							model: "capture-model",
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
						return { messages: [...event.messages, injected] };
					});
				},
			],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd,
			agentDir,
			model,
			authStorage,
			modelRegistry,
			settingsManager,
			sessionManager: SessionManager.inMemory(cwd),
			resourceLoader,
		});

		try {
			session.agent.state.messages.push({
				role: "assistant",
				content: [{ type: "thinking", thinking: "raw state reasoning" }],
				api: "openai-completions",
				provider: "capture-provider",
				model: "capture-model",
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
			});
			await session.prompt("hello", { expandPromptTemplates: false });
		} finally {
			session.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}

		expect(extensionSawRawThinking).toBe(true);
		expect(capturedContext?.messages.some((message) => message.role === "assistant")).toBe(true);
		expect(
			capturedContext?.messages.some(
				(message) => message.role === "assistant" && message.content.some((block) => block.type === "thinking"),
			),
		).toBe(false);
	});

	it("keeps extension context raw while provider-bound replay has retained summaries", async () => {
		const model = createModel();
		const settingsManager = SettingsManager.inMemory({
			retainedContext: { stripThinking: false, compressBashOutput: false },
		});
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-api-key");
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		let capturedContext: Context | undefined;
		let extensionSawRawDuplicate = false;

		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			streamSimple: (_model, context) => {
				capturedContext = context;
				return doneStream();
			},
		});

		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: [
				(pi) => {
					pi.on("context", (event) => {
						extensionSawRawDuplicate = event.messages.some(
							(message) =>
								message.role === "toolResult" &&
								message.toolCallId === "call_old" &&
								message.content.some((block) => block.text === "same content"),
						);
					});
				},
			],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd,
			agentDir,
			model,
			authStorage,
			modelRegistry,
			settingsManager,
			sessionManager: SessionManager.inMemory(cwd),
			resourceLoader,
		});

		try {
			session.agent.state.messages.push(
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "call_old", name: "read", arguments: { path: "src/a.ts" } }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "toolResult",
					toolCallId: "call_old",
					toolName: "read",
					content: [{ type: "text", text: "same content" }],
					isError: false,
					timestamp: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "consumed old" }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "call_new", name: "read", arguments: { path: "src/a.ts" } }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "toolResult",
					toolCallId: "call_new",
					toolName: "read",
					content: [{ type: "text", text: "same content" }],
					isError: false,
					timestamp: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "consumed new" }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "call_filler_1", name: "read", arguments: { path: "f1.ts" } }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "toolResult",
					toolCallId: "call_filler_1",
					toolName: "read",
					content: [{ type: "text", text: "filler 1" }],
					isError: false,
					timestamp: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "consumed filler 1" }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "call_filler_2", name: "read", arguments: { path: "f2.ts" } }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
				{
					role: "toolResult",
					toolCallId: "call_filler_2",
					toolName: "read",
					content: [{ type: "text", text: "filler 2" }],
					isError: false,
					timestamp: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "consumed filler 2" }],
					api: "openai-completions",
					provider: "capture-provider",
					model: "capture-model",
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
				},
			);
			await session.prompt("hello", { expandPromptTemplates: false });
		} finally {
			session.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}

		expect(extensionSawRawDuplicate).toBe(true);
		expect(
			capturedContext?.messages.some(
				(message) =>
					message.role === "toolResult" &&
					message.toolCallId === "call_old" &&
					message.content.some((block) => block.text.includes("Pi retained tool-result summary v1")),
			),
		).toBe(true);
	});
});
