#!/usr/bin/env node

import { renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";
import { fromModelsDev } from "../provider/models-dev/catalog.ts";
import { fromCodex } from "../provider/openai/codex/catalog.ts";
import { fetchJson } from "./generator/fetch.ts";
import type { CodexCatalog, ModelsDevCatalog } from "./generator/schemas.ts";
import { serialize } from "./generator/serialize.ts";
import { apiProviders, catalogUrls, codexProviderSpec } from "./generator/sources.ts";
import { groupModels } from "./generator/validate.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "../..");

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
	return [...apiModels, ...fromCodex(codex, openAiModels, codexProviderSpec)];
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
