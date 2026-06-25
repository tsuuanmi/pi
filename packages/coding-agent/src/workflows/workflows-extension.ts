import type { ExtensionAPI } from "../api/types.ts";
import {
	buildDeepInterviewContinuationPrompt,
	registerDeepInterviewTools,
} from "./deep-interview/deep-interview-tools.ts";
import { registerHarnessTools } from "./harness-tools/harness-tools.ts";
import { registerRalplanTools } from "./ralplan/ralplan-tools.ts";
import { registerWorkflowStateTool, syncMcpHudUi, syncWorkflowHudUi } from "./shared/workflow-state-tool.ts";
import { registerSubagentTools } from "./subagents/subagent-tools.ts";
import { registerTeamTools } from "./team/team-tools.ts";
import { registerUltragoalTools } from "./ultragoal/ultragoal-tools.ts";

export default function workflowsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
		syncMcpHudUi(ctx);
	});
	pi.on("turn_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("tool_execution_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.skipWorkflowContinuation) return undefined;
		await syncWorkflowHudUi(ctx);
		const continuationPrompt = await buildDeepInterviewContinuationPrompt(ctx.cwd, ctx.sessionManager.getSessionId());
		if (!continuationPrompt) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${continuationPrompt}` };
	});

	registerWorkflowStateTool(pi);
	registerDeepInterviewTools(pi);
	registerSubagentTools(pi);
	registerRalplanTools(pi);
	registerTeamTools(pi);
	registerUltragoalTools(pi);
	registerHarnessTools(pi);
}
