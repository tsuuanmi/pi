import type { ThinkingLevel } from "@tsuuanmi/pi-ai";

export type AgentThinkingLevel = Exclude<ThinkingLevel, "xhigh" | "max" | "ultra">;

export function assertAgentThinkingLevel(value: string | undefined): asserts value is AgentThinkingLevel | undefined {
	if (value === undefined) return;
	if (!(["off", "minimal", "low", "medium", "high"] as const).includes(value as AgentThinkingLevel)) {
		throw new Error(`invalid agent thinkingLevel: ${value}`);
	}
}
