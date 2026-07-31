import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";
import { inputFromModalities, thinkingMap } from "../../../model/generator/normalize.ts";
import type { CodexCatalog, CodexCatalogModel } from "../../../model/generator/schemas.ts";
import type { ProviderSpec } from "../../../model/generator/sources.ts";

function contextWindow(model: CodexCatalogModel): number {
	const value = model.max_context_window ?? model.context_window;
	if (value === undefined) {
		throw new Error(`Missing Codex context window for ${model.slug}`);
	}
	return value;
}

function compat(model: CodexCatalogModel): Model<"openai-codex-responses">["compat"] {
	return {
		supportsParallelToolCalls: model.supports_parallel_tool_calls,
		supportsImageDetailOriginal: model.supports_image_detail_original,
		preferWebSockets: model.prefer_websockets,
		minimalClientVersion: model.minimal_client_version,
	};
}

function canBuildCodexModel(model: CodexCatalogModel, openAiModels: ReadonlyMap<string, Model<Api>>): boolean {
	return model.visibility !== "hidden" && openAiModels.has(model.slug);
}

export function fromCodex(
	catalog: CodexCatalog,
	openAiModels: ReadonlyMap<string, Model<Api>>,
	provider: ProviderSpec,
): Model<Api>[] {
	const models: Model<Api>[] = [];

	for (const sourceModel of catalog.models) {
		if (!canBuildCodexModel(sourceModel, openAiModels)) continue;

		const apiModel = openAiModels.get(sourceModel.slug);
		if (!apiModel) throw new Error(`Missing OpenAI API metadata for Codex model ${sourceModel.slug}`);

		const levelMap = thinkingMap(
			sourceModel.slug,
			sourceModel.supported_reasoning_levels?.map((level) => level.effort),
		);

		models.push({
			id: sourceModel.slug,
			name: sourceModel.display_name ?? apiModel.name,
			api: provider.api,
			provider: provider.provider,
			baseUrl: provider.baseUrl,
			reasoning: (sourceModel.supported_reasoning_levels?.length ?? 0) > 0,
			...(levelMap ? { thinkingLevelMap: levelMap } : {}),
			input: inputFromModalities(sourceModel.input_modalities),
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
			},
			contextWindow: contextWindow(sourceModel),
			maxTokens: apiModel.maxTokens,
			compat: compat(sourceModel),
		});
	}

	return models;
}
