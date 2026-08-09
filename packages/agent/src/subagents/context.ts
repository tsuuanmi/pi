import type { SubagentManager } from "#agent/subagents/manager";

export type SubagentDetails = Record<string, unknown>;

export interface SubagentContext {
	manager: SubagentManager;
	sessionId: string;
}
