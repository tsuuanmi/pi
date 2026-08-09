#!/usr/bin/env node

import { renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { fetchJson } from "#ai/model/generator/fetch";
import type { CodexCatalog, ModelsDevCatalog } from "#ai/model/generator/schemas";
import { serialize } from "#ai/model/generator/serialize";
import { apiProviders, catalogUrls, codexProviderSpec } from "#ai/model/generator/sources";
import { groupModels } from "#ai/model/generator/validate";
import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";
import { fromModelsDev } from "#ai/provider/models-dev/catalog";
import { fromCodex } from "#ai/provider/openai/codex/catalog";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "../..");

function mergeThinkingLevelMap(model: Model<Api>, map: NonNullable<Model<Api>["thinkingLevelMap"]>): void {
	model.thinkingLevelMap = { ...model.thinkingLevelMap, ...map };
}

function supportsOpenAiXhigh(modelId: string): boolean {
	return (
		modelId.includes("gpt-5.2") ||
		modelId.includes("gpt-5.3") ||
		modelId.includes("gpt-5.4") ||
		modelId.includes("gpt-5.5")
	);
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

function applyModelMetadataOverrides(models: Model<Api>[]): void {
	for (const model of models) {
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

async function loadModels(): Promise<Model<Api>[]> {
	console.log("Fetching model catalogs...");
	const [modelsDev, codex] = await Promise.all([
		fetchJson<ModelsDevCatalog>(catalogUrls.modelsDev),
		fetchJson<CodexCatalog>(catalogUrls.codex),
	]);

	const apiModels = apiProviders.flatMap((provider) => {
		const source = modelsDev.providers?.[provider.source];
		if (!source?.models) throw new Error(`Missing models.dev provider: ${provider.source}`);

		return fromModelsDev({
			models: source.models,
			provider: provider.provider,
			api: provider.api,
			baseUrl: provider.baseUrl,
		});
	});

	const openAiModels = new Map(
		apiModels.filter((model) => model.provider === "openai").map((model) => [model.id, model]),
	);
	const models = [...apiModels, ...fromCodex(codex, openAiModels, codexProviderSpec)];
	applyModelMetadataOverrides(models);
	for (const model of models) {
		applyThinkingLevelMetadata(model);
	}
	return models;
}

function writeGenerated(output: string): void {
	const generatedPath = join(packageRoot, "src/model/generated.ts");
	const tempPath = `${generatedPath}.tmp`;
	writeFileSync(tempPath, output);
	renameSync(tempPath, generatedPath);
}

async function main(): Promise<void> {
	const models = await loadModels();
	const grouped = groupModels(models);
	writeGenerated(serialize(grouped));

	console.log("Generated src/model/generated.ts");
	console.log("\nModel Statistics:");
	console.log(`  Total tool-capable models: ${models.length}`);
	console.log(`  Reasoning-capable models: ${models.filter((model) => model.reasoning).length}`);
	for (const [provider, providerModels] of Object.entries(grouped)) {
		console.log(`  ${provider}: ${Object.keys(providerModels).length} models`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
