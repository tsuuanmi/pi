export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
const CONSERVATIVE_MAX_OUTPUT_TOKENS = 16_384;

export type ChatGptWebModelId = "light" | "medium" | "high" | "extra-high" | "pro" | "luna";
export type ChatGptWebProviderModelId = `chatgpt-web/${ChatGptWebModelId}`;
export type ChatGptWebReasoningLevel = "low" | "medium" | "high" | "xhigh" | "ultra";

export interface ChatGptWebModelRoute {
	id: ChatGptWebModelId;
	providerId: ChatGptWebProviderModelId;
	name: string;
	reasoning: ChatGptWebReasoningLevel;
	requiresPro: boolean;
	contextWindow: number;
	maxTokens: number;
}

export const CHATGPT_WEB_MODEL_ROUTES: readonly ChatGptWebModelRoute[] = [
	{
		id: "light",
		providerId: "chatgpt-web/light",
		name: "ChatGPT Web — Instant",
		reasoning: "low",
		requiresPro: false,
		contextWindow: 41_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "medium",
		providerId: "chatgpt-web/medium",
		name: "ChatGPT Web — Medium",
		reasoning: "medium",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "high",
		providerId: "chatgpt-web/high",
		name: "ChatGPT Web — High",
		reasoning: "high",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "extra-high",
		providerId: "chatgpt-web/extra-high",
		name: "ChatGPT Web — Extra High",
		reasoning: "xhigh",
		requiresPro: true,
		contextWindow: 111_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "pro",
		providerId: "chatgpt-web/pro",
		name: "ChatGPT Web — Pro",
		reasoning: "ultra",
		requiresPro: true,
		contextWindow: 112_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
];

export const CHATGPT_WEB_LUNA_MODEL_ROUTE: ChatGptWebModelRoute = {
	id: "luna",
	providerId: "chatgpt-web/luna",
	name: "ChatGPT Web — Luna",
	reasoning: "low",
	requiresPro: false,
	contextWindow: 1_050_000,
	maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
};

export function chatGptWebProviderModelId(model: string): ChatGptWebProviderModelId | undefined {
	const luna = CHATGPT_WEB_LUNA_MODEL_ROUTE;
	if (model === luna.id || model === luna.providerId) return luna.providerId;
	const route = CHATGPT_WEB_MODEL_ROUTES.find((candidate) => model === candidate.id || model === candidate.providerId);
	return route?.providerId;
}

export function isLunaModel(model: string): boolean {
	const luna = CHATGPT_WEB_LUNA_MODEL_ROUTE;
	return model === luna.id || model === luna.providerId;
}
