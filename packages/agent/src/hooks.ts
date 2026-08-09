import type { AssistantMessage, Model, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { Agent } from "#agent/agent";
import type { Context } from "#agent/context";
import type { AgentMessage } from "#agent/messages/types";
import type { AgentRunResult } from "#agent/run";
import type { ToolResult } from "#agent/tool/result";
import type { ToolCall } from "#agent/tool-call";

export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
}

export interface AfterToolCallResult {
	content?: import("@tsuuanmi/pi-ai").TextContent[];
	details?: unknown;
	isError?: boolean;
	terminate?: boolean;
}

export interface BeforeToolCallContext {
	assistantMessage: AssistantMessage;
	toolCall: ToolCall;
	args: unknown;
	context: Context;
}

export interface AfterToolCallContext {
	assistantMessage: AssistantMessage;
	toolCall: ToolCall;
	args: unknown;
	result: ToolResult<any>;
	isError: boolean;
	context: Context;
}

export interface ShouldStopAfterTurnContext {
	message: AssistantMessage;
	toolResults: ToolResultMessage[];
	context: Context;
	newMessages: AgentMessage[];
}

export interface AgentLoopTurnUpdate {
	context?: Context;
	model?: Model<any>;
	thinkingLevel?: import("@tsuuanmi/pi-ai").ThinkingLevel;
}

export interface PrepareNextTurnContext extends ShouldStopAfterTurnContext {}

export interface AgentRunHookContext {
	agent: Agent;
	input: string;
	metadata?: Record<string, unknown>;
}

export interface AgentRunResultHookContext {
	agent: Agent;
	result: AgentRunResult;
	error?: unknown;
	metadata?: Record<string, unknown>;
}

export interface AgentHook {
	name: string;
	beforeRun?: (context: AgentRunHookContext, signal?: AbortSignal) => void | Promise<void>;
	afterRun?: (context: AgentRunResultHookContext, signal?: AbortSignal) => void | Promise<void>;
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
	prepareNextTurn?: (
		context: PrepareNextTurnContext,
		signal?: AbortSignal,
	) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;
}
