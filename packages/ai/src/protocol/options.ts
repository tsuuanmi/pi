import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export type ReasoningLevel = Exclude<ThinkingLevel, "off">;
export type ModelThinkingLevel = ThinkingLevel;
export type ThinkingLevelMap = Partial<Record<ModelThinkingLevel, string | null>>;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return THINKING_LEVELS.includes(level as ThinkingLevel);
}

export type CacheRetention = "none" | "short" | "long";

export type Transport = "sse" | "websocket" | "websocket-cached" | "auto";

/** Provider-scoped environment overrides. Values take precedence over process.env. */
export type ProviderEnv = Record<string, string>;

export interface ProviderResponse {
	status: number;
	headers: Record<string, string>;
}

export interface StreamOptions {
	temperature?: number;
	maxTokens?: number;
	reasoning?: ReasoningLevel;
	signal?: AbortSignal;
	apiKey?: string;
	transport?: Transport;
	cacheRetention?: CacheRetention;
	sessionId?: string;
	onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
	onResponse?: (response: ProviderResponse, model: Model<Api>) => void | Promise<void>;
	headers?: Record<string, string>;
	timeoutMs?: number;
	websocketConnectTimeoutMs?: number;
	maxRetries?: number;
	maxRetryDelayMs?: number;
	metadata?: Record<string, unknown>;
	env?: ProviderEnv;
	[key: string]: unknown;
}
