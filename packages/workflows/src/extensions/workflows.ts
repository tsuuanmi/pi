import type { ExtensionAPI } from "@tsuuanmi/pi-agent";
import { getDeepInterviewMutationDecision } from "#src/harness/deep-interview/deep-interview-mutation-guard";
import "#src/harness/deep-interview/deep-interview-transitions";
import { registerRalplanTools } from "#src/harness/ralplan/ralplan-tools";
import "#src/harness/ralplan/ralplan-transitions";
import { syncMcpHudUi, syncWorkflowHudUi } from "#src/harness/shared/hud/workflow-hud";
import { registerSubagentTools } from "#src/harness/subagents/subagent-tools";
import { registerTeamTools } from "#src/harness/team/team-tools";
import "#src/harness/team/team-transitions";
import { registerUltragoalTools } from "#src/harness/ultragoal/ultragoal-tools";
import "#src/harness/ultragoal/ultragoal-transitions";

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
