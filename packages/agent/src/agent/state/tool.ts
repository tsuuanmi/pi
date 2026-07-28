import type { TextContent, Tool } from "@tsuuanmi/pi-ai";
import type { Static, TSchema } from "typebox";
import type { AgentMessage } from "#agent/agent/state/state";
import type { ToolExecutionMode } from "#agent/agent/runtime/config";

export type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;

export interface AgentToolResult<T> {
	content: TextContent[];
	details: T;
	terminate?: boolean;
}

export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
	label: string;
	prepareArguments?: (args: unknown) => Static<TParameters>;
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
	executionMode?: ToolExecutionMode;
}

export interface AgentContext {
	systemPrompt: string;
	messages: AgentMessage[];
	tools?: AgentTool<any>[];
}
