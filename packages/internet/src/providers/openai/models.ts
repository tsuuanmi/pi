import type { ProviderModelConfig } from "@tsuuanmi/pi/extensions";
import type { DaemonCapabilities } from "#internet/daemon/config";
import { CHATGPT_WEB_MODEL_ROUTES, type ChatGptWebModelRoute } from "#internet/providers/openai/turn/model";

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const unsupportedThinkingLevels = {
	off: null,
	minimal: null,
	low: null,
	medium: null,
	high: null,
	xhigh: null,
	max: null,
	ultra: null,
} as const;

function contextWindow(route: ChatGptWebModelRoute, capabilities: DaemonCapabilities): number {
	if (!capabilities.proAvailable) return route.contextWindow;
	return route.id === "pro" ? 112_193 : 111_193;
}

function providerModel(route: ChatGptWebModelRoute, capabilities: DaemonCapabilities): ProviderModelConfig {
	return {
		id: route.id,
		name: route.name,
		reasoning: true,
		thinkingLevelMap: { ...unsupportedThinkingLevels, [route.reasoning]: route.reasoning },
		input: ["text", "image"],
		cost: zeroCost,
		contextWindow: contextWindow(route, capabilities),
		maxTokens: route.maxTokens,
	};
}

export function chatGptWebModels(capabilities: DaemonCapabilities): ProviderModelConfig[] {
	return CHATGPT_WEB_MODEL_ROUTES.filter((route) => !route.requiresPro || capabilities.proAvailable).map((route) =>
		providerModel(route, capabilities),
	);
}
