import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";
import { CHATGPT_WEB_LUNA_MODEL, CHATGPT_WEB_SOL_MODEL } from "#internet/backends/openai/turn/model";

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const CHATGPT_WEB_MODELS: ProviderModelConfig[] = [
	{
		id: CHATGPT_WEB_SOL_MODEL,
		name: "GPT-5.6 Sol",
		reasoning: true,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: null,
			ultra: null,
		},
		input: ["text", "image"],
		cost: zeroCost,
		contextWindow: 90_000,
		maxTokens: 90_000,
	},
	{
		id: CHATGPT_WEB_LUNA_MODEL,
		name: "GPT-5.6 Luna",
		reasoning: true,
		thinkingLevelMap: {
			off: null,
			minimal: null,
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
			ultra: null,
		},
		input: ["text", "image"],
		cost: zeroCost,
		contextWindow: 1_050_000,
		maxTokens: 128_000,
	},
];
