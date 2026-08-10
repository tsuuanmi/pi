import type { SubagentManagerApi } from "#pi/subagents/manager-api";

export type SubagentDetails = Record<string, unknown>;

export interface SubagentContext {
	manager: SubagentManagerApi;
	sessionId: string;
}
