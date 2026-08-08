import type { AgentToolResult, AgentToolUpdateCallback, SubagentManager, ToolExecutionMode } from "@tsuuanmi/pi-agent";
import type { Static, TSchema } from "typebox";
import { registerDeepInterviewTools } from "#workflows/skills/deep-interview/tools";
import { registerRalplanTools } from "#workflows/skills/ralplan/tools";
import { registerTeamTools } from "#workflows/skills/team/tools";
import { registerUltragoalTools } from "#workflows/skills/ultragoal/tools";
import { registerSubagentTools } from "#workflows/tools/subagent-tools";

export interface WorkflowContext {
	cwd: string;
	sessionManager: {
		getSessionId(): string;
	};
	subagents?: SubagentManager;
}

export interface WorkflowToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: TParams;
	renderShell?: "default" | "self";
	prepareArguments?: (args: unknown) => Static<TParams>;
	executionMode?: ToolExecutionMode;
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
		ctx: WorkflowContext,
	): Promise<AgentToolResult<TDetails>>;
}

export interface WorkflowToolHost {
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(
		tool: WorkflowToolDefinition<TParams, TDetails>,
	): void;
}

export function registerWorkflowTools(host: WorkflowToolHost): void {
	registerSubagentTools(host);
	registerDeepInterviewTools(host);
	registerRalplanTools(host);
	registerTeamTools(host);
	registerUltragoalTools(host);
}
