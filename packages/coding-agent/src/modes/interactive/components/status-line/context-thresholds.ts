import type { ThemeColor } from "#coding-agent/theme/theme";

export type ContextUsageLevel = "normal" | "warning" | "purple" | "error";

const CONTEXT_WARNING_PERCENT_THRESHOLD = 50;
const CONTEXT_WARNING_TOKEN_THRESHOLD = 150_000;
const CONTEXT_PURPLE_PERCENT_THRESHOLD = 70;
const CONTEXT_PURPLE_TOKEN_THRESHOLD = 270_000;
const CONTEXT_ERROR_PERCENT_THRESHOLD = 90;
const CONTEXT_ERROR_TOKEN_THRESHOLD = 500_000;

/**
 * Determine whether a context-usage level threshold is reached.
 *
 * A level trips when the context percent reaches `min(percentThreshold,
 * tokenPercentThreshold)`, where `tokenPercentThreshold` is the percent of
 * the context window that `tokenThreshold` tokens occupy. This means a small
 * context window trips a level via absolute tokens before it trips via
 * percent. When the context window is unknown/invalid, only the percent
 * threshold applies. (Ported from gajae-code `context-thresholds.ts:12-28`.)
 */
function reachesThreshold(
	contextPercent: number | null,
	contextWindow: number,
	percentThreshold: number,
	tokenThreshold: number,
): boolean {
	if (contextPercent === null || !Number.isFinite(contextPercent) || contextPercent <= 0) {
		return false;
	}

	if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
		return contextPercent >= percentThreshold;
	}

	const tokenPercentThreshold = (tokenThreshold / contextWindow) * 100;
	return contextPercent >= Math.min(percentThreshold, tokenPercentThreshold);
}

export function getContextUsageLevel(contextPercent: number | null, contextWindow: number): ContextUsageLevel {
	if (
		reachesThreshold(contextPercent, contextWindow, CONTEXT_ERROR_PERCENT_THRESHOLD, CONTEXT_ERROR_TOKEN_THRESHOLD)
	) {
		return "error";
	}

	if (
		reachesThreshold(contextPercent, contextWindow, CONTEXT_PURPLE_PERCENT_THRESHOLD, CONTEXT_PURPLE_TOKEN_THRESHOLD)
	) {
		return "purple";
	}

	if (
		reachesThreshold(
			contextPercent,
			contextWindow,
			CONTEXT_WARNING_PERCENT_THRESHOLD,
			CONTEXT_WARNING_TOKEN_THRESHOLD,
		)
	) {
		return "warning";
	}

	return "normal";
}

/**
 * Map a context-usage level to a Pi `ThemeColor`. Pi has no `statusLineContext`
 * token (gajae uses one for the `normal` level), so `normal` maps to `dim`.
 * The other levels map to existing Pi colors:
 * `warning -> warning`, `purple -> thinkingHigh`, `error -> error`.
 */
export function getContextUsageThemeColor(level: ContextUsageLevel): ThemeColor {
	switch (level) {
		case "error":
			return "error";
		case "purple":
			return "thinkingHigh";
		case "warning":
			return "warning";
		case "normal":
			return "dim";
	}
}
