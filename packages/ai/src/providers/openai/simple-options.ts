import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses.js";
import type { Api, Model, SimpleStreamOptions, StreamOptions, Usage } from "#ai/types";

const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;

export function clampOpenAIPromptCacheKey(key: string | undefined): string | undefined {
	if (key === undefined) return undefined;
	const chars = Array.from(key);
	if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return key;
	return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join("");
}

export function buildBaseOptions(_model: Model<Api>, options?: SimpleStreamOptions, apiKey?: string): StreamOptions {
	return {
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
		transport: options?.transport,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		timeoutMs: options?.timeoutMs,
		websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
		maxRetries: options?.maxRetries,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
		env: options?.env,
	};
}

export type OpenAIServiceTier = ResponseCreateParamsStreaming["service_tier"];

export function getOpenAIServiceTierCostMultiplier(
	model: { id: string },
	serviceTier: OpenAIServiceTier | undefined,
): number {
	switch (serviceTier) {
		case "flex":
			return 0.5;
		case "priority":
			return model.id === "gpt-5.5" ? 2.5 : 2;
		default:
			return 1;
	}
}

export function applyOpenAIServiceTierPricing(
	usage: Usage,
	serviceTier: OpenAIServiceTier | undefined,
	model: { id: string },
): void {
	const multiplier = getOpenAIServiceTierCostMultiplier(model, serviceTier);
	if (multiplier === 1) return;

	usage.cost.input *= multiplier;
	usage.cost.output *= multiplier;
	usage.cost.cacheRead *= multiplier;
	usage.cost.cacheWrite *= multiplier;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
