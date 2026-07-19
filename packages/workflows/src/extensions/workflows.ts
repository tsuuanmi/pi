import type { ExtensionAPI } from "@tsuuanmi/pi-agent";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "#workflows/harness/deep-interview/deep-interview-mutation-guard";
import { registerDeepInterviewTools } from "#workflows/harness/deep-interview/deep-interview-tools";
import "#workflows/harness/deep-interview/deep-interview-transitions";
import { registerRalplanTools } from "#workflows/harness/ralplan/ralplan-tools";
import "#workflows/harness/ralplan/ralplan-transitions";
import { registerSubagentTools } from "#workflows/harness/subagents/subagent-tools";
import { registerTeamTools } from "#workflows/harness/team/team-tools";
import "#workflows/harness/team/team-transitions";
import { registerUltragoalTools } from "#workflows/harness/ultragoal/ultragoal-tools";
import "#workflows/harness/ultragoal/ultragoal-transitions";

export default function workflowsExtension(pi: ExtensionAPI): void {
	registerSubagentTools(pi);
	registerDeepInterviewTools(pi);
	registerRalplanTools(pi);
	registerTeamTools(pi);
	registerUltragoalTools(pi);
	pi.on("session_start", async (_event, ctx) => {
		await refreshHudUi(ctx);
	});
	pi.on("turn_end", async (_event, ctx) => {
		await refreshHudUi(ctx);
	});
	pi.on("tool_execution_end", async (_event, ctx) => {
		await refreshHudUi(ctx);
	});
	pi.on("before_agent_start", async (_event, ctx) => {
		if (ctx.skipWorkflowContinuation) return undefined;
		await refreshHudUi(ctx);
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "bash") return undefined;
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
