import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "@tsuuanmi/pi-workflows";
import { registerWorkflowTools } from "@tsuuanmi/pi-workflows/tools/workflow-tools";
import type { ExtensionAPI } from "#pi/api/types";

export default function builtinWorkflowsExtension(pi: ExtensionAPI): void {
	registerWorkflowTools(pi);

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
		if (ctx.skipAutomaticContinuation) return undefined;
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
