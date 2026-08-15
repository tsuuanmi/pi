export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
const CONSERVATIVE_MAX_OUTPUT_TOKENS = 16_384;

export type ChatGptWebModelId = "light" | "medium" | "high" | "extra-high" | "pro" | "luna";
export type ChatGptWebBackendModelId = `chatgpt-web/${ChatGptWebModelId}`;
export type ChatGptWebReasoningLevel = "low" | "medium" | "high" | "xhigh" | "ultra";

export interface ChatGptWebModelRoute {
	id: ChatGptWebModelId;
	backendId: ChatGptWebBackendModelId;
	name: string;
	reasoning: ChatGptWebReasoningLevel;
	requiresPro: boolean;
	contextWindow: number;
	maxTokens: number;
}

export const CHATGPT_WEB_MODEL_ROUTES: readonly ChatGptWebModelRoute[] = [
	{
		id: "light",
		backendId: "chatgpt-web/light",
		name: "ChatGPT Web — Instant",
		reasoning: "low",
		requiresPro: false,
		contextWindow: 41_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "medium",
		backendId: "chatgpt-web/medium",
		name: "ChatGPT Web — Medium",
		reasoning: "medium",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "high",
		backendId: "chatgpt-web/high",
		name: "ChatGPT Web — High",
		reasoning: "high",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "extra-high",
		backendId: "chatgpt-web/extra-high",
		name: "ChatGPT Web — Extra High",
		reasoning: "xhigh",
		requiresPro: true,
		contextWindow: 111_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "pro",
		backendId: "chatgpt-web/pro",
		name: "ChatGPT Web — Pro",
		reasoning: "ultra",
		requiresPro: true,
		contextWindow: 112_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
];

export const CHATGPT_WEB_LUNA_MODEL_ROUTE: ChatGptWebModelRoute = {
	id: "luna",
	backendId: "chatgpt-web/luna",
	name: "ChatGPT Web — Luna",
	reasoning: "low",
	requiresPro: false,
	contextWindow: 1_050_000,
	maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
};

export function chatGptWebBackendModelId(model: string): ChatGptWebBackendModelId | undefined {
	const luna = CHATGPT_WEB_LUNA_MODEL_ROUTE;
	if (model === luna.id || model === luna.backendId) return luna.backendId;
	const route = CHATGPT_WEB_MODEL_ROUTES.find((candidate) => model === candidate.id || model === candidate.backendId);
	return route?.backendId;
}

export function isLunaModel(model: string): boolean {
	const luna = CHATGPT_WEB_LUNA_MODEL_ROUTE;
	return model === luna.id || model === luna.backendId;
}
