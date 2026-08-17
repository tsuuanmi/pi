import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";
import type { DaemonCapabilities } from "#internet/daemon/config";

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export function geminiWebModels(capabilities: DaemonCapabilities): ProviderModelConfig[] {
	return (capabilities.models ?? []).map((model) => ({
		id: model.id,
		name: model.label,
		reasoning: false,
		input: ["text"],
		cost: zeroCost,
		contextWindow: 32_000,
		maxTokens: 8_192,
	}));
}
