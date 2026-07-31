import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";
import { inputFromModalities, thinkingMap } from "../../model/generator/normalize.ts";
import type { ModelsDevModel } from "../../model/generator/schemas.ts";

export interface ProviderSource {
	models: Record<string, ModelsDevModel>;
	provider: string;
	api: Api;
	baseUrl: string;
}

function requiredNumber(value: number | undefined, field: string, modelId: string): number {
	if (value === undefined) throw new Error(`Missing ${field} for ${modelId}`);
	return value;
}

export function fromModelsDev(source: ProviderSource): Model<Api>[] {
	const models: Model<Api>[] = [];
	for (const [id, sourceModel] of Object.entries(source.models)) {
		if (sourceModel.tool_call !== true) continue;

		const levelMap = thinkingMap(
			id,
			sourceModel.reasoning_options?.find((option) => option.type === "effort")?.values,
		);

		const contextWindow = requiredNumber(sourceModel.limit?.context ?? sourceModel.limit?.input, "context limit", id);
		const maxTokens = requiredNumber(sourceModel.limit?.output, "output limit", id);

		models.push({
			id,
			name: sourceModel.name ?? id,
			api: source.api,
			provider: source.provider,
			baseUrl: source.baseUrl,
			reasoning: sourceModel.reasoning === true,
			...(levelMap ? { thinkingLevelMap: levelMap } : {}),
			input: inputFromModalities(sourceModel.modalities?.input),
			cost: {
				input: sourceModel.cost?.input ?? 0,
				output: sourceModel.cost?.output ?? 0,
				cacheRead: sourceModel.cost?.cache_read ?? 0,
				cacheWrite: sourceModel.cost?.cache_write ?? 0,
			},
			contextWindow,
			maxTokens,
		});
	}

	return models;
}
