export type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

export function assertAgentThinkingLevel(value: string | undefined): asserts value is AgentThinkingLevel | undefined {
	if (value === undefined) return;
	if (!["off", "minimal", "low", "medium", "high"].includes(value)) {
		throw new Error(`invalid agent thinkingLevel: ${value}`);
	}
}
