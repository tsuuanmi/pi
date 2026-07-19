import type { ExtensionContext } from "@tsuuanmi/pi-agent";

export type DeepInterviewHandoff = "ralplan" | "team" | "ultragoal" | "stop";
export type RalplanApprovalTarget = "ultragoal" | "team" | "stop";
export type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

export function assertDeepInterviewHandoff(
	value: string | undefined,
): asserts value is DeepInterviewHandoff | undefined {
	if (value === undefined) return;
	if (!["ralplan", "team", "ultragoal", "stop"].includes(value)) throw new Error(`unknown handoff workflow: ${value}`);
}

export function assertRalplanApprovalTarget(
	value: string | undefined,
): asserts value is RalplanApprovalTarget | undefined {
	if (value === undefined) return;
	if (!["ultragoal", "team", "stop"].includes(value)) throw new Error(`unknown ralplan approval target: ${value}`);
}

export function assertRalplanRole(
	value: string | undefined,
): asserts value is "explorer" | "planner" | "architect" | "critic" | "expert" | undefined {
	if (value === undefined) return;
	if (!["explorer", "planner", "architect", "critic", "expert"].includes(value)) {
		throw new Error(`unknown ralplan agent role: ${value}`);
	}
}

export function assertAgentThinkingLevel(value: string | undefined): asserts value is AgentThinkingLevel | undefined {
	if (value === undefined) return;
	if (!["off", "minimal", "low", "medium", "high"].includes(value)) {
		throw new Error(`invalid agent thinkingLevel: ${value}`);
	}
}

export function requireSubagentManager(ctx: ExtensionContext) {
	if (!ctx.subagents) throw new Error("No subagent manager is available in this session.");
	return ctx.subagents;
}
