import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses.js";
import type { Usage } from "#ai/core/types";

export type OpenAIServiceTier = ResponseCreateParamsStreaming["service_tier"];

export function getOpenAIServiceTierCostMultiplier(
	model: { id: string },
	serviceTier: OpenAIServiceTier | undefined,
): number {
	switch (serviceTier) {
		case "flex":
			return 0.5;
		case "priority":
			return model.id === "gpt-5.5" ? 2.5 : 2;
		default:
			return 1;
	}
}

export function applyOpenAIServiceTierPricing(
	usage: Usage,
	serviceTier: OpenAIServiceTier | undefined,
	model: { id: string },
): void {
	const multiplier = getOpenAIServiceTierCostMultiplier(model, serviceTier);
	if (multiplier === 1) return;

	usage.cost.input *= multiplier;
	usage.cost.output *= multiplier;
	usage.cost.cacheRead *= multiplier;
	usage.cost.cacheWrite *= multiplier;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
