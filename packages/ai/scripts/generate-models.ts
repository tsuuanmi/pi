#!/usr/bin/env node

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Api, Model } from "#ai/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

interface ModelsDevModel {
	id: string;
	name: string;
	tool_call?: boolean;
	reasoning?: boolean;
	limit?: {
		context?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
	};
}

function supportsOpenAiXhigh(modelId: string): boolean {
	return (
		modelId.includes("gpt-5.2") ||
		modelId.includes("gpt-5.3") ||
		modelId.includes("gpt-5.4") ||
		modelId.includes("gpt-5.5")
	);
}

function mergeThinkingLevelMap(model: Model<Api>, map: NonNullable<Model<Api>["thinkingLevelMap"]>): void {
	model.thinkingLevelMap = { ...model.thinkingLevelMap, ...map };
}

function isAnthropicTemperatureUnsupportedModel(modelId: string): boolean {
	const id = modelId.toLowerCase();
	return id.includes("opus-4-7") || id.includes("opus-4.7") || id.includes("opus-4-8") || id.includes("opus-4.8");
}

function applyThinkingLevelMetadata(model: Model<Api>): void {
	if (model.api === "openai-responses" && model.provider === "openai" && model.id.startsWith("gpt-5")) {
		mergeThinkingLevelMap(model, { off: null });
	}
	if (model.api === "openai-responses" && model.provider === "openai" && model.id === "gpt-5.5") {
		mergeThinkingLevelMap(model, { off: "none", minimal: null });
	}
	if (model.id.endsWith("gpt-5.5-pro")) {
		mergeThinkingLevelMap(model, { off: null, minimal: null, low: null });
	}
	if (supportsOpenAiXhigh(model.id)) {
		mergeThinkingLevelMap(model, { xhigh: "xhigh" });
	}
	if (model.provider === "openai-codex" && supportsOpenAiXhigh(model.id)) {
		mergeThinkingLevelMap(model, { minimal: "low" });
	}
	if (model.id.includes("opus-4-6") || model.id.includes("opus-4.6")) {
		mergeThinkingLevelMap(model, { xhigh: "max" });
	}
	if (
		model.id.includes("opus-4-7") ||
		model.id.includes("opus-4.7") ||
		model.id.includes("opus-4-8") ||
		model.id.includes("opus-4.8")
	) {
		mergeThinkingLevelMap(model, { xhigh: "xhigh" });
	}
	if (model.api === "anthropic-messages" && model.id.includes("fable-5")) {
		mergeThinkingLevelMap(model, { off: null, xhigh: "xhigh" });
	}
	if (model.api === "anthropic-messages" && isAnthropicTemperatureUnsupportedModel(model.id)) {
		model.compat = { ...model.compat, supportsTemperature: false };
	}
}

function fromModelsDev(
	providerModels: Record<string, unknown> | undefined,
	provider: "anthropic" | "openai",
	api: "anthropic-messages" | "openai-responses",
	baseUrl: string,
): Model<Api>[] {
	if (!providerModels) return [];
	const models: Model<Api>[] = [];
	for (const [modelId, model] of Object.entries(providerModels)) {
		const m = model as ModelsDevModel;
		if (m.tool_call !== true) continue;
		models.push({
			id: modelId,
			name: m.name || modelId,
			api,
			provider,
			baseUrl,
			reasoning: m.reasoning === true,
			input: ["text"],
			cost: {
				input: m.cost?.input || 0,
				output: m.cost?.output || 0,
				cacheRead: m.cost?.cache_read || 0,
				cacheWrite: m.cost?.cache_write || 0,
			},
			contextWindow: m.limit?.context || 4096,
			maxTokens: m.limit?.output || 4096,
		});
	}
	return models;
}

async function loadModelsDevData(): Promise<Model<Api>[]> {
	try {
		console.log("Fetching models from models.dev API...");
		const response = await fetch("https://models.dev/api.json");
		const data = await response.json();
		return [
			...fromModelsDev(data.anthropic?.models, "anthropic", "anthropic-messages", "https://api.anthropic.com"),
			...fromModelsDev(data.openai?.models, "openai", "openai-responses", "https://api.openai.com/v1"),
		];
	} catch (error) {
		console.error("Failed to load models.dev data:", error);
		return [];
	}
}

function addMissingModels(allModels: Model<Api>[]): void {
	const addIfMissing = (model: Model<Api>) => {
		if (!allModels.some((candidate) => candidate.provider === model.provider && candidate.id === model.id)) {
			allModels.push(model);
		}
	};

	for (const model of allModels) {
		if (model.provider === "anthropic" && model.id === "claude-opus-4-5") {
			model.cost.cacheRead = 0.5;
			model.cost.cacheWrite = 6.25;
		}
		if (model.provider === "openai" && (model.id === "gpt-5.4" || model.id === "gpt-5.5")) {
			model.contextWindow = 272000;
			model.maxTokens = 128000;
		}
		if (model.provider === "openai" && model.id === "gpt-5-pro") {
			model.maxTokens = 128000;
		}
	}

	addIfMissing({
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		provider: "anthropic",
		reasoning: true,
		input: ["text"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 1000000,
		maxTokens: 128000,
	});
	addIfMissing({
		id: "claude-opus-4-7",
		name: "Claude Opus 4.7",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		provider: "anthropic",
		reasoning: true,
		input: ["text"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 1000000,
		maxTokens: 128000,
	});
	addIfMissing({
		id: "claude-opus-4-8",
		name: "Claude Opus 4.8",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		provider: "anthropic",
		reasoning: true,
		input: ["text"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 1000000,
		maxTokens: 128000,
	});
	addIfMissing({
		id: "claude-sonnet-4-6",
		name: "Claude Sonnet 4.6",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		provider: "anthropic",
		reasoning: true,
		input: ["text"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 1000000,
		maxTokens: 64000,
	});
	const openAiBase = {
		api: "openai-responses" as const,
		baseUrl: "https://api.openai.com/v1",
		provider: "openai" as const,
		input: ["text" as const],
	};
	addIfMissing({
		...openAiBase,
		id: "gpt-5-chat-latest",
		name: "GPT-5 Chat Latest",
		reasoning: false,
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	});
	addIfMissing({
		...openAiBase,
		id: "gpt-5.1-codex",
		name: "GPT-5.1 Codex",
		reasoning: true,
		cost: { input: 1.25, output: 5, cacheRead: 0.125, cacheWrite: 1.25 },
		contextWindow: 400000,
		maxTokens: 128000,
	});
	addIfMissing({
		...openAiBase,
		id: "gpt-5.1-codex-max",
		name: "GPT-5.1 Codex Max",
		reasoning: true,
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	});
	addIfMissing({
		...openAiBase,
		id: "gpt-5.3-codex-spark",
		name: "GPT-5.3 Codex Spark",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	});
	addIfMissing({
		...openAiBase,
		id: "gpt-5.4",
		name: "GPT-5.4",
		reasoning: true,
		cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
		contextWindow: 272000,
		maxTokens: 128000,
	});

	const codexBase = {
		api: "openai-codex-responses" as const,
		provider: "openai-codex" as const,
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		maxTokens: 128000,
	};
	addIfMissing({
		...codexBase,
		id: "gpt-5.3-codex-spark",
		name: "GPT-5.3 Codex Spark",
		input: ["text"],
		cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
		contextWindow: 128000,
	});
	addIfMissing({
		...codexBase,
		id: "gpt-5.4",
		name: "GPT-5.4",
		input: ["text"],
		cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
		contextWindow: 272000,
	});
	addIfMissing({
		...codexBase,
		id: "gpt-5.4-mini",
		name: "GPT-5.4 mini",
		input: ["text"],
		cost: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
		contextWindow: 272000,
	});
	addIfMissing({
		...codexBase,
		id: "gpt-5.5",
		name: "GPT-5.5",
		input: ["text"],
		cost: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 272000,
	});
}

async function generateModels(): Promise<void> {
	const allModels = await loadModelsDevData();
	addMissingModels(allModels);

	for (const model of allModels) {
		applyThinkingLevelMetadata(model);
	}

	const providers: Record<string, Record<string, Model<Api>>> = {};
	for (const model of allModels) {
		providers[model.provider] ??= {};
		providers[model.provider][model.id] ??= model;
	}

	let output = `// This file is auto-generated by scripts/generate-models.ts
// Do not edit manually - run 'npm run generate-models' to update

import type { Model } from "#ai/types";

export const MODELS = {
`;

	for (const providerId of Object.keys(providers).sort()) {
		const models = providers[providerId];
		output += `\t${JSON.stringify(providerId)}: {\n`;
		for (const modelId of Object.keys(models).sort()) {
			const model = models[modelId];
			output += `\t\t${JSON.stringify(model.id)}: {\n`;
			output += `\t\t\tid: ${JSON.stringify(model.id)},\n`;
			output += `\t\t\tname: ${JSON.stringify(model.name)},\n`;
			output += `\t\t\tapi: ${JSON.stringify(model.api)},\n`;
			output += `\t\t\tprovider: ${JSON.stringify(model.provider)},\n`;
			output += `\t\t\tbaseUrl: ${JSON.stringify(model.baseUrl)},\n`;
			if (model.compat) output += `\t\t\tcompat: ${JSON.stringify(model.compat)},\n`;
			output += `\t\t\treasoning: ${model.reasoning},\n`;
			if (model.thinkingLevelMap) output += `\t\t\tthinkingLevelMap: ${JSON.stringify(model.thinkingLevelMap)},\n`;
			output += `\t\t\tinput: [${model.input.map((input) => JSON.stringify(input)).join(", ")}],\n`;
			output += `\t\t\tcost: {\n`;
			output += `\t\t\t\tinput: ${model.cost.input},\n`;
			output += `\t\t\t\toutput: ${model.cost.output},\n`;
			output += `\t\t\t\tcacheRead: ${model.cost.cacheRead},\n`;
			output += `\t\t\t\tcacheWrite: ${model.cost.cacheWrite},\n`;
			output += `\t\t\t},\n`;
			output += `\t\t\tcontextWindow: ${model.contextWindow},\n`;
			output += `\t\t\tmaxTokens: ${model.maxTokens},\n`;
			output += `\t\t} satisfies Model<${JSON.stringify(model.api)}>,\n`;
		}
		output += `\t},\n`;
	}

	output += `} as const;\n`;
	writeFileSync(join(packageRoot, "src/models/generated.ts"), output);
	console.log("Generated src/models/generated.ts");

	const totalModels = allModels.length;
	const reasoningModels = allModels.filter((model) => model.reasoning).length;
	console.log(`\nModel Statistics:`);
	console.log(`  Total tool-capable models: ${totalModels}`);
	console.log(`  Reasoning-capable models: ${reasoningModels}`);
	for (const [provider, models] of Object.entries(providers)) {
		console.log(`  ${provider}: ${Object.keys(models).length} models`);
	}
}

generateModels().catch(console.error);
