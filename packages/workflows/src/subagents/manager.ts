import type { SubagentManager } from "@tsuuanmi/pi-agent";
import type { WorkflowContext } from "#workflows/tools/workflow-tools";

export function requireSubagentManager(ctx: WorkflowContext): SubagentManager {
	if (!ctx.subagents) throw new Error("No subagent manager is available in this session.");
	return ctx.subagents;
}
