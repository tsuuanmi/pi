import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";

const reasoningLevels = { low: "low", medium: "medium", high: "high" } as const;

export const googleModels: ProviderModelConfig[] = [
	{
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		reasoning: true,
		thinkingLevelMap: reasoningLevels,
		input: ["text", "image"],
		cost: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
		contextWindow: 1_048_576,
		maxTokens: 65_536,
	},
	{
		id: "gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		reasoning: true,
		thinkingLevelMap: reasoningLevels,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
		contextWindow: 1_048_576,
		maxTokens: 65_536,
	},
];
