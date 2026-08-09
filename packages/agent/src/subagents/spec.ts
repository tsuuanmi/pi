import type { Static, TSchema } from "typebox";
import type { SubagentContext, SubagentDetails } from "#agent/subagents/context";
import type { ToolResult, ToolUpdate } from "#agent/tool/result";
import type { ToolSpec } from "#agent/tool/tool";

export interface SubagentSpec<TParameters extends TSchema = TSchema, TDetails extends SubagentDetails = SubagentDetails>
	extends Omit<ToolSpec<TParameters, TDetails>, "execute"> {
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		context: SubagentContext,
		signal?: AbortSignal,
		onUpdate?: ToolUpdate<TDetails>,
	) => Promise<ToolResult<TDetails>>;
}
