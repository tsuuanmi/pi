import type { SubagentManagerApi } from "@tsuuanmi/pi";
import type { Model } from "@tsuuanmi/pi-agent";

export interface WorkflowContext {
	cwd: string;
	sessionManager: {
		getSessionId(): string;
	};
	subagents: SubagentManagerApi;
	model?: Model;
}
