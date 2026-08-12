import type { ToolResult, ToolSpec, ToolUpdate } from "@tsuuanmi/pi-agent";
import type { Static, TSchema } from "typebox";
import type { SubagentContext, SubagentDetails } from "#orchestrator/subagent/context";

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
