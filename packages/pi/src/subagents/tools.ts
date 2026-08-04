import { type Static, Type } from "typebox";
import type { ExtensionAPI } from "#pi/api/extension-types";
import { requireSubagentControls } from "#pi/subagents/controls";
import { attachControlReceipt } from "#pi/subagents/receipts";

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

export function registerSubagentControls(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "subagent_inspect",
		label: "Subagent Inspect",
		description: "Inspect a Pi subagent record, artifact, worker metadata, and execution metadata.",
		promptSnippet: "Inspect durable Pi subagent state",
		promptGuidelines: ["Use subagent_inspect to inspect durable Pi execution state."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params: SubagentIdInput, _signal, _onUpdate, ctx) => {
			const controls = requireSubagentControls(ctx);
			const sessionId = ctx.sessionManager.getSessionId();
			const result = await controls.inspect(params.id, sessionId);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				details: attachControlReceipt(result, sessionId),
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
			const controls = requireSubagentControls(ctx);
			const sessionId = ctx.sessionManager.getSessionId();
			const result = await controls.attach(params.id, sessionId);
			const text = result.ok
				? `Attach ${params.id}: ${result.attachCommand}`
				: `Subagent ${params.id} attach failed: ${result.reason}`;
			return {
				content: [{ type: "text" as const, text }],
				details: attachControlReceipt(result, sessionId),
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
			const controls = requireSubagentControls(ctx);
			const sessionId = ctx.sessionManager.getSessionId();
			const result = await controls.kill(params.id, sessionId);
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
				details: attachControlReceipt(result, sessionId),
			};
		},
	});
}
