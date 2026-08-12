import type { SubagentManagerApi } from "#orchestrator/subagent/manager-api";

export type SubagentDetails = Record<string, unknown>;

export interface SubagentContext {
	manager: SubagentManagerApi;
	sessionId: string;
}
