import type { ThinkingLevel } from "@tsuuanmi/pi-agent";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return THINKING_LEVELS.includes(level as ThinkingLevel);
}
