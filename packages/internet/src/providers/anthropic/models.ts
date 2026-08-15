import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";
import { getModel } from "@tsuuanmi/pi-ai";

const modelIds = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] as const;

export const anthropicModels: ProviderModelConfig[] = modelIds.map((id) => {
	const model = getModel("anthropic", id);
	return {
		id: model.id,
		name: model.name,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	};
});
