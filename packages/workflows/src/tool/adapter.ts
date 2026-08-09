import { getStructuredReceipt, type SubagentDetails, type SubagentSpec, type ToolResult } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import { type WorkflowReceipt, workflowReceiptWithStructuredReceipt } from "#workflows/artifacts/artifacts";
import type { WorkflowToolSpec } from "#workflows/tool/spec";

export function adaptSubagentSpec<TParameters extends TSchema, TDetails extends SubagentDetails>(
	spec: SubagentSpec<TParameters, TDetails>,
): WorkflowToolSpec<TParameters, WorkflowReceipt> {
	return {
		name: spec.name,
		label: spec.label,
		description: spec.description,
		promptSnippet: spec.promptSnippet,
		promptGuidelines: spec.promptGuidelines,
		parameters: spec.parameters,
		prepareArguments: spec.prepareArguments,
		executionMode: spec.executionMode,
		maxOutputChars: spec.maxOutputChars,
		execute: async (toolCallId, params, signal, onUpdate, context) => {
			const manager = context.subagents;
			if (!manager) throw new Error("No subagent manager is available in this session.");
			const update = onUpdate ? (partial: ToolResult<TDetails>) => onUpdate(toWorkflowResult(partial)) : undefined;
			const result = await spec.execute(
				toolCallId,
				params,
				{ manager, sessionId: context.sessionManager.getSessionId() },
				signal,
				update,
			);
			return toWorkflowResult(result);
		},
	};
}

function toWorkflowResult<TDetails extends SubagentDetails>(result: ToolResult<TDetails>): ToolResult<WorkflowReceipt> {
	return {
		...result,
		details: workflowReceiptWithStructuredReceipt(result.details, getStructuredReceipt(result.details)),
	};
}
