import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Api, type AssistantMessage, createAssistantMessageEventStream, type Model } from "@tsuuanmi/pi-ai";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../../src/core/auth/auth-storage.ts";
import { ModelRegistry } from "../../src/core/model/model-registry.ts";
import { createAgentSession } from "../../src/core/sdk/sdk.ts";
import { SessionManager } from "../../src/core/session-manager/session-manager.ts";
import { SettingsManager } from "../../src/core/settings/settings-manager.ts";
import { DefaultResourceLoader } from "../../src/core/skills/resource-loader.ts";
import { WORKFLOW_OWNED_TOOLS } from "../../src/packages/workflows/runtime/shared/tool-groups.ts";
import workflowsExtension from "../../src/packages/workflows/runtime/workflows-extension.ts";

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

describe("workflows extension tool pruning", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-workflow-pruning-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("removes workflow-owned tools on startup when no workflow is active", async () => {
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [
				workflowsExtension,
				(pi) => {
					pi.registerTool({
						name: "custom_tool",
						label: "Custom Tool",
						description: "Non-workflow custom tool",
						promptSnippet: "Use custom tool",
						parameters: Type.Object({}),
						execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
					});
				},
			],
		});
		await resourceLoader.reload();

		const model = createModel();
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-api-key");
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		modelRegistry.registerProvider(model.provider, { api: model.api, streamSimple: () => doneStream() });
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model,
			authStorage,
			modelRegistry,
			settingsManager,
			sessionManager: SessionManager.inMemory(tempDir),
			resourceLoader,
		});

		try {
			expect(session.getActiveToolNames()).toContain("ralplan_status");
			await session.bindExtensions({});
			const activeTools = session.getActiveToolNames();
			expect(activeTools).toContain("read");
			expect(activeTools).toContain("custom_tool");
			expect(activeTools.some((name) => WORKFLOW_OWNED_TOOLS.has(name))).toBe(false);
			expect(session.systemPrompt).not.toContain("ralplan_status");
		} finally {
			session.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}
	});

	it("keeps the provider-bound system prompt synchronized after before-start pruning", async () => {
		const model = createModel();
		const settingsManager = SettingsManager.create(tempDir, agentDir);
		const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
		authStorage.setRuntimeApiKey(model.provider, "test-api-key");
		const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
		let capturedSystemPrompt = "";
		let capturedTools: string[] = [];
		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			streamSimple: (_model, context) => {
				capturedSystemPrompt = context.systemPrompt ?? "";
				capturedTools = context.tools?.map((tool) => tool.name) ?? [];
				return doneStream();
			},
		});
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories: [workflowsExtension],
		});
		await resourceLoader.reload();

		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir,
			model,
			authStorage,
			modelRegistry,
			settingsManager,
			sessionManager: SessionManager.inMemory(tempDir),
			resourceLoader,
		});

		try {
			await session.bindExtensions({});
			await session.prompt(
				'<skill name="ralplan" location="/tmp/ralplan/SKILL.md">\nRalplan skill\n</skill>\n\ndraft a plan',
				{
					expandPromptTemplates: false,
				},
			);
			expect(capturedTools).toContain("ralplan_status");
			expect(capturedTools).not.toContain("team_start");
			expect(capturedSystemPrompt).toContain("ralplan_status");
			expect(capturedSystemPrompt).not.toContain("team_start");
		} finally {
			session.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}
	});
});
