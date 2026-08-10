import { isValidThinkingLevel, type ThinkingLevel } from "@tsuuanmi/pi-agent";

export function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !isValidThinkingLevel(value)) {
		throw new Error(`invalid thinkingLevel: ${String(value)}`);
	}
	return value;
}
