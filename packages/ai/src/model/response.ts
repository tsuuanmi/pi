import type { AssistantMessage } from "#ai/protocol/message";

export type { AssistantMessageDiagnostic } from "#ai/protocol/diagnostic";
export type { AssistantMessage, StopReason } from "#ai/protocol/message";
export type { ProviderResponse } from "#ai/protocol/options";
export type { Usage, UsageProvenance } from "#ai/protocol/usage";

const OVERFLOW_PATTERNS = [
	/prompt is too long/i,
	/request_too_large/i,
	/exceeds the context window/i,
	/exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i,
];

const NON_OVERFLOW_PATTERNS = [/^(Throttling error|Service unavailable):/i, /rate limit/i, /too many requests/i];

function isContextOverflowError(errorMessage: string): boolean {
	if (NON_OVERFLOW_PATTERNS.some((pattern) => pattern.test(errorMessage))) return false;
	return OVERFLOW_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

export function isContextOverflow(message: AssistantMessage, contextWindow: number): boolean {
	if (message.stopReason === "error" && message.errorMessage) {
		return isContextOverflowError(message.errorMessage);
	}

	if (message.stopReason !== "length" || message.usage.output !== 0) return false;
	if (!Number.isFinite(contextWindow) || contextWindow <= 0) return false;

	const inputTokens = message.usage.input + message.usage.cacheRead;
	return inputTokens >= contextWindow * 0.99;
}
