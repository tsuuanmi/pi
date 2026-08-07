import type { ProviderModelConfig } from "#pi/api/provider-types";

export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
export const CHATGPT_WEB_ROUTE_PREFIX = `${CHATGPT_WEB_PROVIDER}/`;
export const CHATGPT_WEB_BASE_URL_ENV = "PI_CHATGPT_WEB_BASE_URL";

const CHATGPT_WEB_COMPAT = {
	supportsDeveloperRole: true,
	sendSessionIdHeader: false,
	supportsLongCacheRetention: false,
};

const CHATGPT_WEB_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
};

interface ChatGptWebRoute {
	id: string;
	name: string;
	contextWindow: number;
}

const CHATGPT_WEB_ROUTES: ChatGptWebRoute[] = [
	{ id: "light", name: "ChatGPT Web Instant", contextWindow: 150_000 },
	{ id: "medium", name: "ChatGPT Web Medium", contextWindow: 150_000 },
	{ id: "high", name: "ChatGPT Web High", contextWindow: 185_000 },
	{ id: "extra-high", name: "ChatGPT Web Extra High", contextWindow: 256_000 },
	{ id: "pro", name: "ChatGPT Web Pro", contextWindow: 272_000 },
];

function createModel(route: ChatGptWebRoute): ProviderModelConfig {
	return {
		id: route.id,
		name: route.name,
		reasoning: false,
		input: ["text", "image"],
		cost: { ...CHATGPT_WEB_COST },
		contextWindow: route.contextWindow,
		maxTokens: 128_000,
		compat: { ...CHATGPT_WEB_COMPAT },
	};
}

export const CHATGPT_WEB_MODELS = CHATGPT_WEB_ROUTES.map(createModel);
