import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-coding-agent";
import { getDeepInterviewMutationDecision } from "../harness/deep-interview/deep-interview-mutation-guard.ts";
import {
	buildDeepInterviewContinuationPrompt,
	registerDeepInterviewTools,
} from "../harness/deep-interview/deep-interview-tools.ts";
import { registerRalplanTools } from "../harness/ralplan/ralplan-tools.ts";
import { readWorkflowActiveState } from "../harness/shared/active-state.ts";
import { resolveWorkflowToolGroup, sameToolSet, selectWorkflowActiveTools } from "../harness/shared/tool-groups.ts";
import { registerWorkflowStateTool, syncMcpHudUi, syncWorkflowHudUi } from "../harness/shared/workflow-state-tool.ts";
import { registerSubagentTools } from "../harness/subagents/subagent-tools.ts";
import { registerTeamTools } from "../harness/team/team-tools.ts";
import { registerHarnessTools } from "../harness/tools/harness-tools.ts";
import { registerUltragoalTools } from "../harness/ultragoal/ultragoal-tools.ts";

async function applyWorkflowToolPruning(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	currentPromptText?: string,
): Promise<boolean> {
	if (!pi.getFlag || !pi.getAllTools || !pi.getActiveTools || !pi.setActiveTools) return false;
	if (pi.getFlag("workflows.pruneInactiveTools") === false) return false;
	const activeWorkflowState = await readWorkflowActiveState(ctx.cwd, { sessionId: ctx.sessionManager.getSessionId() });
	const selectedGroup = resolveWorkflowToolGroup({ currentPromptText, activeWorkflowState });
	const availableToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
	const currentActiveTools = pi.getActiveTools();
	const nextActiveTools = selectWorkflowActiveTools({ currentActiveTools, selectedGroup, availableToolNames });
	if (sameToolSet(currentActiveTools, nextActiveTools)) return false;
	pi.setActiveTools(nextActiveTools);
	return true;
}

export default function workflowsExtension(pi: ExtensionAPI): void {
	pi.registerFlag?.("workflows.pruneInactiveTools", {
		type: "boolean",
		default: true,
		description: "Prune inactive Pi workflow tools from model-visible tool schemas.",
	});
	pi.on("session_start", async (_event, ctx) => {
		await applyWorkflowToolPruning(pi, ctx);
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
		const pruned = await applyWorkflowToolPruning(pi, ctx, event.prompt);
		if (ctx.skipWorkflowContinuation) return undefined;
		await syncWorkflowHudUi(ctx);
		const continuationPrompt = await buildDeepInterviewContinuationPrompt(ctx.cwd, ctx.sessionManager.getSessionId());
		if (!continuationPrompt) return pruned ? { systemPrompt: ctx.getSystemPrompt() } : undefined;
		const baseSystemPrompt = pruned ? ctx.getSystemPrompt() : event.systemPrompt;
		return { systemPrompt: `${baseSystemPrompt}\n\n${continuationPrompt}` };
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
