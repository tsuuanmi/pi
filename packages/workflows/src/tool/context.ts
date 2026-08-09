import type { SubagentManager } from "@tsuuanmi/pi-agent";

export interface WorkflowContext {
	cwd: string;
	sessionManager: {
		getSessionId(): string;
	};
	subagents?: SubagentManager;
}
