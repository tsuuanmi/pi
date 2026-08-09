import type { ToolResult, ToolSpec, ToolUpdate } from "@tsuuanmi/pi-agent";
import type { Static, TSchema } from "typebox";
import type { WorkflowContext } from "#workflows/tool/context";

export interface WorkflowToolSpec<TParams extends TSchema = TSchema, TDetails = unknown>
	extends Omit<ToolSpec<TParams, TDetails>, "execute"> {
	renderShell?: "default" | "self";
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: ToolUpdate<TDetails> | undefined,
		context: WorkflowContext,
	): Promise<ToolResult<TDetails>>;
}
