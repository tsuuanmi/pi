import type { ThinkingLevel } from "@tsuuanmi/pi-agent";

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";
export const CLI_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
	"ultra",
] as const satisfies readonly ThinkingLevel[];

export type CliThinkingLevel = (typeof CLI_THINKING_LEVELS)[number];

export function isValidCliThinkingLevel(level: string): level is CliThinkingLevel {
	return CLI_THINKING_LEVELS.includes(level as CliThinkingLevel);
}
