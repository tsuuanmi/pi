import type { AssistantMessage, Model, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { Agent } from "#agent/agent";
import type { Context } from "#agent/context";
import type { Message } from "#agent/messages/state";
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
	newMessages: Message[];
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

export class AgentHookRegistry {
	private readonly hooks = new Map<string, AgentHook>();

	constructor(hooks: readonly AgentHook[] = []) {
		for (const hook of hooks) {
			this.register(hook);
		}
	}

	register(hook: AgentHook): () => void {
		if (!hook.name || hook.name.trim() !== hook.name) {
			throw new Error("Agent hook name must be non-empty and trimmed");
		}
		if (this.hooks.has(hook.name)) {
			throw new Error(`Agent hook already registered: ${hook.name}`);
		}
		if (!hook.beforeRun && !hook.afterRun && !hook.beforeToolCall && !hook.afterToolCall && !hook.prepareNextTurn) {
			throw new Error(`Agent hook has no handlers: ${hook.name}`);
		}

		this.hooks.set(hook.name, hook);
		return () => {
			if (this.hooks.get(hook.name) === hook) {
				this.hooks.delete(hook.name);
			}
		};
	}

	snapshot(): AgentHook[] {
		return [...this.hooks.values()];
	}

	clear(): void {
		this.hooks.clear();
	}
}

export async function runBeforeHooks(
	hooks: readonly AgentHook[],
	context: AgentRunHookContext,
	signal?: AbortSignal,
): Promise<void> {
	for (const hook of hooks) {
		await hook.beforeRun?.(context, signal);
	}
}

export async function runAfterHooks(
	hooks: readonly AgentHook[],
	context: AgentRunResultHookContext,
	signal?: AbortSignal,
): Promise<void> {
	for (const hook of hooks) {
		await hook.afterRun?.(context, signal);
	}
}
