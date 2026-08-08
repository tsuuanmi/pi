import type { Static, TSchema } from "typebox";
import type { SubagentManager } from "#agent/subagents/manager";
import type { AgentToolResult } from "#agent/tool/types";

export type SubagentDetails = Record<string, unknown>;

export interface SubagentToolContext {
	manager: SubagentManager;
	sessionId: string;
}

export interface SubagentTool<
	TParameters extends TSchema = TSchema,
	TDetails extends SubagentDetails = SubagentDetails,
> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: TParameters;
	execute(
		toolCallId: string,
		params: Static<TParameters>,
		context: SubagentToolContext,
		signal?: AbortSignal,
	): Promise<AgentToolResult<TDetails>>;
}
