import type { AssistantMessage } from "#ai/core/types";

/**
 * Regex patterns to detect context overflow errors from supported providers.
 *
 * These patterns match error messages returned when the input exceeds
 * the model's context window.
 *
 * Provider-specific patterns (with example error messages):
 *
 * - Anthropic: "prompt is too long: X tokens > Y maximum" or "request_too_large"
 * - OpenAI (Completions & Responses): "exceeds the context window", "exceeds the model's maximum context length of X tokens"
 */
const OVERFLOW_PATTERNS = [
	/prompt is too long/i, // Anthropic token overflow
	/request_too_large/i, // Anthropic request byte-size overflow (HTTP 413)
	/exceeds the context window/i, // OpenAI (Completions & Responses API)
	/exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i, // OpenAI
];

/**
 * Patterns that indicate non-overflow errors (e.g. rate limiting, server errors).
 * Error messages matching any of these are excluded from overflow detection
 * even if they also match an OVERFLOW_PATTERN.
 *
 * Example: a throttling error formatted as "Too many tokens, please wait before
 * trying again." would match the /too many tokens/i overflow pattern without
 * this exclusion.
 */
const NON_OVERFLOW_PATTERNS = [
	/^(Throttling error|Service unavailable):/i, // Throttling / service unavailable prefixes
	/rate limit/i, // Generic rate limiting
	/too many requests/i, // Generic HTTP 429 style
];

function isContextOverflowError(errorMessage: string): boolean {
	if (NON_OVERFLOW_PATTERNS.some((p) => p.test(errorMessage))) return false;
	return OVERFLOW_PATTERNS.some((p) => p.test(errorMessage));
}

/**
 * Check if an assistant message represents a context overflow error.
 *
 * This handles two cases:
 * 1. Error-based overflow: most providers return stopReason "error" with a
 *    detectable error message pattern.
 * 2. Silent overflow: a provider truncates oversized input to fit the context
 *    window, leaving no room for output. Detected via stopReason "length" with
 *    output=0 and input (including cache reads) filling the context window.
 *
 * ## Custom Providers
 *
 * If you've added custom models via settings.json, this function may not detect
 * overflow errors from those providers. To add support:
 *
 * 1. Send a request that exceeds the model's context window
 * 2. Check the errorMessage in the response
 * 3. Add a regex pattern that matches the error to OVERFLOW_PATTERNS, or
 *    check the errorMessage yourself before calling this function
 *
 * @param message - The assistant message to check
 * @param contextWindow - Context window size for detecting silent overflow
 * @returns true if the message indicates a context overflow
 */
export function isContextOverflow(message: AssistantMessage, contextWindow: number): boolean {
	// Case 1: Check error message patterns
	if (message.stopReason === "error" && message.errorMessage) {
		return isContextOverflowError(message.errorMessage);
	}

	// Case 2: Silent overflow - server truncates oversized input to fit the
	// context window, leaving no room for output. Returns stopReason "length"
	// with output=0 and input+cacheRead filling the context window.
	if (message.stopReason !== "length" || message.usage.output !== 0) return false;
	if (!Number.isFinite(contextWindow) || contextWindow <= 0) return false;

	const inputTokens = message.usage.input + message.usage.cacheRead;
	return inputTokens >= contextWindow * 0.99;
}
