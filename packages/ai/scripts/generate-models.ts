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
}

function fromModelsDev(
	providerModels: Record<string, unknown> | undefined,
	provider: string,
	api: Api,
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
		const openAiModels = fromModelsDev(data.openai?.models, "openai", "openai-responses", "https://api.openai.com/v1");
		return [
			...fromModelsDev(data.anthropic?.models, "anthropic", "anthropic-messages", "https://api.anthropic.com"),
			...openAiModels,
			...toOpenAiCodexModels(openAiModels),
			...fromModelsDev(
				data["ollama-cloud"]?.models,
				"ollama-cloud",
				"openai-completions",
				data["ollama-cloud"]?.api || "https://ollama.com/v1",
			),
		];
	} catch (error) {
		console.error("Failed to load models.dev data:", error);
		return [];
	}
}

function toOpenAiCodexModels(openAiModels: Model<Api>[]): Model<Api>[] {
	const codexModelIds = new Set(["gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini", "gpt-5.5"]);
	return openAiModels
		.filter((model) => codexModelIds.has(model.id))
		.map((model) => ({
			...model,
			api: "openai-codex-responses",
			provider: "openai-codex",
			baseUrl: "https://chatgpt.com/backend-api",
		}));
}

function applyModelMetadataOverrides(allModels: Model<Api>[]): void {
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
		if (model.api === "anthropic-messages") {
			const modelId = model.id.toLowerCase();
			const supportsTemperature = !(
				modelId.includes("opus-4-7") ||
				modelId.includes("opus-4.7") ||
				modelId.includes("opus-4-8") ||
				modelId.includes("opus-4.8")
			);
			if (!supportsTemperature) {
				model.compat = { ...model.compat, supportsTemperature };
			}
		}
	}
}

async function generateModels(): Promise<void> {
	const allModels = await loadModelsDevData();
	applyModelMetadataOverrides(allModels);

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
