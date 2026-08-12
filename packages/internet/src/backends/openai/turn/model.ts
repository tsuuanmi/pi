export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
const CONSERVATIVE_MAX_OUTPUT_TOKENS = 16_384;

export type ChatGptWebModelId =
	| "chatgpt-web/light"
	| "chatgpt-web/medium"
	| "chatgpt-web/high"
	| "chatgpt-web/extra-high"
	| "chatgpt-web/pro"
	| "chatgpt-web/luna";

export type ChatGptWebReasoningLevel = "low" | "medium" | "high" | "xhigh" | "ultra";

export interface ChatGptWebModelRoute {
	id: ChatGptWebModelId;
	name: string;
	reasoning: ChatGptWebReasoningLevel;
	requiresPro: boolean;
	contextWindow: number;
	maxTokens: number;
}

export const CHATGPT_WEB_MODEL_ROUTES: readonly ChatGptWebModelRoute[] = [
	{
		id: "chatgpt-web/light",
		name: "ChatGPT Web — Instant",
		reasoning: "low",
		requiresPro: false,
		contextWindow: 41_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "chatgpt-web/medium",
		name: "ChatGPT Web — Medium",
		reasoning: "medium",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "chatgpt-web/high",
		name: "ChatGPT Web — High",
		reasoning: "high",
		requiresPro: false,
		contextWindow: 90_000,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "chatgpt-web/extra-high",
		name: "ChatGPT Web — Extra High",
		reasoning: "xhigh",
		requiresPro: true,
		contextWindow: 111_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
	{
		id: "chatgpt-web/pro",
		name: "ChatGPT Web — Pro",
		reasoning: "ultra",
		requiresPro: true,
		contextWindow: 112_193,
		maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
	},
];

export const CHATGPT_WEB_LUNA_MODEL_ROUTE: ChatGptWebModelRoute = {
	id: "chatgpt-web/luna",
	name: "ChatGPT Web — Luna",
	reasoning: "low",
	requiresPro: false,
	contextWindow: 1_050_000,
	maxTokens: CONSERVATIVE_MAX_OUTPUT_TOKENS,
};

export function isLunaModel(model: string): boolean {
	return model === CHATGPT_WEB_LUNA_MODEL_ROUTE.id;
}
