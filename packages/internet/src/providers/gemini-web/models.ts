import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";
import type { DaemonCapabilities } from "#internet/daemon/config";

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const singleReasoningLevel = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: null,
	max: null,
	ultra: null,
} as const;

export function geminiWebModels(capabilities: DaemonCapabilities): ProviderModelConfig[] {
	return (capabilities.models ?? []).map((model) => ({
		id: model.id,
		name: model.label,
		reasoning: true,
		thinkingLevelMap: singleReasoningLevel,
		input: ["text"],
		cost: zeroCost,
		contextWindow: 32_000,
		maxTokens: 8_192,
	}));
}
