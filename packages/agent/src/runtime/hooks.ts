import type { Agent } from "#agent/agent";
import type {
	AfterToolCallContext,
	AfterToolCallResult,
	AgentLoopConfig,
	AgentLoopTurnUpdate,
	BeforeToolCallContext,
	BeforeToolCallResult,
	PrepareNextTurnContext,
} from "#agent/runtime/config";
import type { AgentRunResult } from "#agent/runtime/types";

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

export function createLoopHooks(
	hooks: readonly AgentHook[],
	getSignal: () => AbortSignal | undefined,
): Pick<AgentLoopConfig, "beforeToolCall" | "afterToolCall" | "prepareNextTurn"> {
	const beforeToolCall: AgentLoopConfig["beforeToolCall"] = hooks.some((hook) => hook.beforeToolCall)
		? async (context, signal) => {
				for (const hook of hooks) {
					const result = await hook.beforeToolCall?.(context, signal);
					if (result?.block) {
						return result;
					}
				}
				return undefined;
			}
		: undefined;

	const afterToolCall: AgentLoopConfig["afterToolCall"] = hooks.some((hook) => hook.afterToolCall)
		? async (context, signal) => {
				let result = context.result;
				let isError = context.isError;
				let changed = false;

				for (const hook of hooks) {
					const next = await hook.afterToolCall?.({ ...context, result, isError }, signal);
					if (!next) {
						continue;
					}

					changed = true;
					result = {
						content: next.content ?? result.content,
						details: next.details ?? result.details,
						terminate: next.terminate ?? result.terminate,
					};
					isError = next.isError ?? isError;
				}

				return changed ? { ...result, isError } : undefined;
			}
		: undefined;

	const prepareNextTurn: AgentLoopConfig["prepareNextTurn"] = hooks.some((hook) => hook.prepareNextTurn)
		? async (context) => {
				let update: AgentLoopTurnUpdate | undefined;
				for (const hook of hooks) {
					const next = await hook.prepareNextTurn?.(context, getSignal());
					if (!next) {
						continue;
					}

					if (next.context !== undefined) {
						update = { ...(update ?? {}), context: next.context };
					}
					if (next.model !== undefined) {
						update = { ...(update ?? {}), model: next.model };
					}
					if (next.thinkingLevel !== undefined) {
						update = { ...(update ?? {}), thinkingLevel: next.thinkingLevel };
					}
				}
				return update;
			}
		: undefined;

	return { beforeToolCall, afterToolCall, prepareNextTurn };
}
