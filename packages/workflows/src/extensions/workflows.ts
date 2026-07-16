import type { ExtensionAPI } from "@tsuuanmi/pi-agent";
import { getDeepInterviewMutationDecision } from "../harness/deep-interview/deep-interview-mutation-guard.ts";
import {
	buildDeepInterviewContinuationPrompt,
	registerDeepInterviewTools,
} from "../harness/deep-interview/deep-interview-tools.ts";
import { registerRalplanTools } from "../harness/ralplan/ralplan-tools.ts";
import { registerWorkflowStateTool, syncMcpHudUi, syncWorkflowHudUi } from "../harness/shared/workflow-state-tool.ts";
import { registerSubagentTools } from "../harness/subagents/subagent-tools.ts";
import { registerTeamTools } from "../harness/team/team-tools.ts";
import { registerHarnessTools } from "../harness/tools/harness-tools.ts";
import { registerUltragoalTools } from "../harness/ultragoal/ultragoal-tools.ts";

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

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return undefined;
		const decision = await getDeepInterviewMutationDecision({
			cwd: ctx.cwd,
			sessionId: ctx.sessionManager.getSessionId(),
			toolName: event.toolName,
			input: event.input as Record<string, unknown>,
		});
		if (!decision.blocked) return undefined;
		return { block: true, reason: decision.message };
	});

	registerWorkflowStateTool(pi);
	registerDeepInterviewTools(pi);
	registerSubagentTools(pi);
	registerRalplanTools(pi);
	registerTeamTools(pi);
	registerUltragoalTools(pi);
	registerHarnessTools(pi);
}
