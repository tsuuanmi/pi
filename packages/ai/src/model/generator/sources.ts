import type { Api } from "#ai/protocol/ids";

const codexRevision = process.env.OPENAI_CODEX_REVISION ?? "main";

export const catalogUrls = {
	modelsDev: "https://models.dev/catalog.json",
	codex: `https://raw.githubusercontent.com/openai/codex/${codexRevision}/codex-rs/models-manager/models.json`,
} as const;

export interface ProviderSpec {
	source: string;
	provider: string;
	api: Api;
	baseUrl: string;
}

export const codexProviderSpec: ProviderSpec = {
	source: "openai-codex",
	provider: "openai-codex",
	api: "openai-codex-responses",
	baseUrl: "https://chatgpt.com/backend-api",
};

export const apiProviders: readonly ProviderSpec[] = [
	{
		source: "anthropic",
		provider: "anthropic",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
	},
	{
		source: "openai",
		provider: "openai",
		api: "openai-responses",
		baseUrl: "https://api.openai.com/v1",
	},
	{
		source: "ollama-cloud",
		provider: "ollama-cloud",
		api: "openai-completions",
		baseUrl: "https://ollama.com/v1",
	},
] as const;
