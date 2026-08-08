import {
	getStructuredReceipt,
	type SubagentTool,
	subagentAwaitTool,
	subagentCancelTool,
	subagentPauseTool,
	subagentResumeTool,
	subagentSpawnTool,
	subagentStatusTool,
	subagentSteerTool,
} from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import { type WorkflowReceipt, workflowReceiptWithStructuredReceipt } from "#workflows/artifacts/artifacts";
import type { WorkflowToolDefinition, WorkflowToolHost } from "#workflows/tools";

export function registerSubagentTools(host: WorkflowToolHost): void {
	register(host, subagentSpawnTool);
	register(host, subagentStatusTool);
	register(host, subagentAwaitTool);
	register(host, subagentSteerTool);
	register(host, subagentPauseTool);
	register(host, subagentResumeTool);
	register(host, subagentCancelTool);
}

function register<TParameters extends TSchema>(host: WorkflowToolHost, tool: SubagentTool<TParameters>): void {
	host.registerTool(adaptTool(tool));
}

function adaptTool<TParameters extends TSchema>(
	tool: SubagentTool<TParameters>,
): WorkflowToolDefinition<TParameters, WorkflowReceipt> {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		promptSnippet: tool.promptSnippet,
		promptGuidelines: tool.promptGuidelines,
		parameters: tool.parameters,
		execute: async (toolCallId, params, signal, _onUpdate, context) => {
			const manager = context.subagents;
			if (!manager) throw new Error("No subagent manager is available in this session.");
			const result = await tool.execute(
				toolCallId,
				params,
				{ manager, sessionId: context.sessionManager.getSessionId() },
				signal,
			);
			const receipt = getStructuredReceipt(result.details);
			return {
				...result,
				details: workflowReceiptWithStructuredReceipt(result.details, receipt),
			};
		},
	};
}
