import { type ThemeColor, TUI_COLOR_PROFILE } from "#tui/theme/theme";

export type ContextUsageLevel = "normal" | "warning" | "purple" | "error";

const CONTEXT_WARNING_PERCENT_THRESHOLD = 50;
const CONTEXT_PURPLE_PERCENT_THRESHOLD = 75;
const CONTEXT_ERROR_PERCENT_THRESHOLD = 100;

/**
 * Determine whether a context-usage level threshold is reached.
 *
 * A level trips when the context percent reaches the configured percent
 * threshold. The context window is intentionally ignored so the warning stays
 * model-agnostic across providers with different window sizes.
 */
function reachesThreshold(contextPercent: number | null, percentThreshold: number): boolean {
	if (contextPercent === null || !Number.isFinite(contextPercent) || contextPercent <= 0) {
		return false;
	}

	return contextPercent >= percentThreshold;
}

export function getContextUsageLevel(contextPercent: number | null, contextWindow: number): ContextUsageLevel {
	void contextWindow;

	if (reachesThreshold(contextPercent, CONTEXT_ERROR_PERCENT_THRESHOLD)) {
		return "error";
	}

	if (reachesThreshold(contextPercent, CONTEXT_PURPLE_PERCENT_THRESHOLD)) {
		return "purple";
	}

	if (reachesThreshold(contextPercent, CONTEXT_WARNING_PERCENT_THRESHOLD)) {
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
	return TUI_COLOR_PROFILE.statusLine.context[level];
}
