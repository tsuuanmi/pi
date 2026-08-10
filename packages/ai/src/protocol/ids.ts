export type KnownApi = "openai-completions" | "openai-responses" | "openai-codex-responses" | "anthropic-messages";

export type Api = KnownApi | (string & {});

export type KnownProviderId = "anthropic" | "openai" | "openai-codex" | "ollama-cloud";

export type ProviderId = KnownProviderId | string;
