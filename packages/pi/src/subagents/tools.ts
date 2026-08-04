import { createSubagentReceipt } from "@tsuuanmi/pi-agent";
import { requireSubagentManager, workflowReceiptWithStructuredReceipt } from "@tsuuanmi/pi-workflows";
import type { WorkflowContext, WorkflowToolHost } from "@tsuuanmi/pi-workflows/tools/workflow-tools";
import { type Static, Type } from "typebox";
import { SubagentManager } from "#pi/subagents/manager";
import type { SubagentControls } from "#pi/subagents/types";

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

function requireSubagentControls(ctx: WorkflowContext): SubagentControls {
	const manager = requireSubagentManager(ctx);
	if (!(manager instanceof SubagentManager)) {
		throw new Error("Pi subagent controls are unavailable for this manager.");
	}
	return manager;
}

export function registerSubagentControls(host: WorkflowToolHost): void {
	host.registerTool({
		name: "subagent_inspect",
		label: "Subagent Inspect",
		description: "Inspect a Pi subagent record, artifact, worker metadata, and execution metadata.",
		promptSnippet: "Inspect durable Pi subagent state",
		promptGuidelines: ["Use subagent_inspect to inspect durable Pi execution state."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params: SubagentIdInput, _signal, _onUpdate, ctx) => {
			const result = await requireSubagentControls(ctx).inspect(params.id, ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				details: workflowReceiptWithStructuredReceipt(
					result as unknown as Record<string, unknown>,
					result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
				),
			};
		},
	});

	host.registerTool({
		name: "subagent_attach",
		label: "Subagent Attach",
		description: "Return Pi execution attach guidance for a live subagent.",
		promptSnippet: "Attach to a live Pi subagent",
		promptGuidelines: ["Use subagent_attach to return the exact attach command for a live Pi subagent."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params: SubagentIdInput, _signal, _onUpdate, ctx) => {
			const result = await requireSubagentControls(ctx).attach(params.id, ctx.sessionManager.getSessionId());
			const text = result.ok
				? `Attach ${params.id}: ${result.attachCommand}`
				: `Subagent ${params.id} attach failed: ${result.reason}`;
			return {
				content: [{ type: "text" as const, text }],
				details: workflowReceiptWithStructuredReceipt(
					result as unknown as Record<string, unknown>,
					result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
				),
			};
		},
	});

	host.registerTool({
		name: "subagent_kill",
		label: "Subagent Kill",
		description: "Stop a Pi subagent using the runtime's live-control checks.",
		promptSnippet: "Stop a live Pi subagent",
		promptGuidelines: ["Use subagent_kill to stop a Pi subagent that should not continue."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params: SubagentIdInput, _signal, _onUpdate, ctx) => {
			const result = await requireSubagentControls(ctx).kill(params.id, ctx.sessionManager.getSessionId());
			let text: string;
			if (result.ok) {
				text = `Subagent ${params.id} killed`;
			} else if ("reason" in result) {
				text = `Subagent ${params.id} kill failed: ${result.reason}`;
			} else {
				throw new Error("Subagent kill failure did not include a reason.");
			}
			return {
				content: [{ type: "text" as const, text }],
				details: workflowReceiptWithStructuredReceipt(
					result as unknown as Record<string, unknown>,
					result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
				),
			};
		},
	});
}
