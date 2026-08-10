import type { SubagentManagerApi } from "@tsuuanmi/pi";

export interface WorkflowContext {
	cwd: string;
	sessionManager: {
		getSessionId(): string;
	};
	subagents: SubagentManagerApi;
}
