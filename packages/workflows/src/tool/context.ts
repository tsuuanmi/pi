import type { Model } from "@tsuuanmi/pi-agent";
import type { SubagentManagerApi } from "@tsuuanmi/pi-orchestrator";

export interface WorkflowContext {
	cwd: string;
	sessionManager: {
		getSessionId(): string;
	};
	subagent: SubagentManagerApi;
	model?: Model;
	resolveModel(provider: string, modelId: string): Model | undefined;
}
