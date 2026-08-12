import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { type Static, Type } from "typebox";
import { attachInspectionReceipt } from "#orchestrator/subagent/receipts";
import { getSubagentManager } from "#orchestrator/subagent/registry";

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

export function registerSubagentInspection(host: Pick<ExtensionAPI, "registerTool">): void {
	host.registerTool({
		name: "subagent_inspect",
		label: "Subagent Inspect",
		description: "Inspect a Pi subagent record and artifact path.",
		promptSnippet: "Inspect durable Pi subagent state",
		promptGuidelines: ["Use subagent_inspect to inspect durable Pi execution state."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params: SubagentIdInput, _signal, _onUpdate, context) => {
			const sessionId = context.sessionManager.getSessionId();
			const result = await getSubagentManager(context).inspect(params.id, sessionId);
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				details: attachInspectionReceipt(result, sessionId),
			};
		},
	});
}
