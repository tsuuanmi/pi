import type { ExtensionAPI } from "@tsuuanmi/pi-agent";
import { getDeepInterviewMutationDecision } from "../harness/deep-interview/deep-interview-mutation-guard.ts";
import "../harness/deep-interview/deep-interview-transitions.ts";
import { registerRalplanTools } from "../harness/ralplan/ralplan-tools.ts";
import "../harness/ralplan/ralplan-transitions.ts";
import { syncMcpHudUi, syncWorkflowHudUi } from "../harness/shared/workflow-hud.ts";
import { registerSubagentTools } from "../harness/subagents/subagent-tools.ts";
import { registerTeamTools } from "../harness/team/team-tools.ts";
import "../harness/team/team-transitions.ts";
import { registerUltragoalTools } from "../harness/ultragoal/ultragoal-tools.ts";
import "../harness/ultragoal/ultragoal-transitions.ts";

export default function workflowsExtension(pi: ExtensionAPI): void {
	registerSubagentTools(pi);
	registerRalplanTools(pi);
	registerTeamTools(pi);
	registerUltragoalTools(pi);
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
	pi.on("before_agent_start", async (_event, ctx) => {
		if (ctx.skipWorkflowContinuation) return undefined;
		await syncWorkflowHudUi(ctx);
		return undefined;
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
}
