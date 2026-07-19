import type { AgentMessage } from "@tsuuanmi/pi-agent";
import type { Extension, ExtensionContext, ExtensionError } from "#coding-agent/api/types";
import type {
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	ContextEvent,
	ContextEventResult,
	ExtensionEvent,
	InputEvent,
	InputEventResult,
	MessageEndEvent,
	MessageEndEventResult,
	ResourcesDiscoverEvent,
	ResourcesDiscoverResult,
	SessionBeforeCompactResult,
	SessionBeforeForkResult,
	SessionBeforeSwitchResult,
	SessionBeforeTreeResult,
	ToolCallEvent,
	ToolCallEventResult,
	ToolResultEvent,
	ToolResultEventResult,
	UserBashEvent,
	UserBashEventResult,
} from "#coding-agent/hooks/event-types";
import type { BuildSystemPromptOptions } from "#coding-agent/skills/system-prompt";

export type HookErrorEmitter = (error: ExtensionError) => void;

export interface HookDispatchState {
	extensions: Extension[];
	ctx: ExtensionContext;
	emitError: HookErrorEmitter;
	isStale: () => boolean;
}

/** Combined result from all before_agent_start handlers. */
export interface BeforeAgentStartCombinedResult {
	messages?: NonNullable<BeforeAgentStartEventResult["message"]>[];
	systemPrompt?: string;
}

export type RunnerEmitEvent = Exclude<
	ExtensionEvent,
	| ToolCallEvent
	| ToolResultEvent
	| UserBashEvent
	| ContextEvent
	| BeforeProviderRequestEvent
	| { type: "before_agent_start" }
	| MessageEndEvent
	| { type: "resources_discover" }
	| InputEvent
>;

export type SessionBeforeEvent = Extract<
	RunnerEmitEvent,
	{ type: "session_before_switch" | "session_before_fork" | "session_before_compact" | "session_before_tree" }
>;

export type SessionBeforeEventResult =
	| SessionBeforeSwitchResult
	| SessionBeforeForkResult
	| SessionBeforeCompactResult
	| SessionBeforeTreeResult;

export type RunnerEmitResult<TEvent extends RunnerEmitEvent> = TEvent extends { type: "session_before_switch" }
	? SessionBeforeSwitchResult | undefined
	: TEvent extends { type: "session_before_fork" }
		? SessionBeforeForkResult | undefined
		: TEvent extends { type: "session_before_compact" }
			? SessionBeforeCompactResult | undefined
			: TEvent extends { type: "session_before_tree" }
				? SessionBeforeTreeResult | undefined
				: undefined;

export function hasExtensionHookHandlers(extensions: Extension[], isStale: () => boolean, eventType: string): boolean {
	if (isStale()) return false;
	for (const ext of extensions) {
		const handlers = ext.handlers.get(eventType);
		if (handlers && handlers.length > 0) {
			return true;
		}
	}
	return false;
}

function recordHookError(state: HookDispatchState, extensionPath: string, event: string, err: unknown): void {
	state.emitError({
		extensionPath,
		event,
		error: err instanceof Error ? err.message : String(err),
		stack: err instanceof Error ? err.stack : undefined,
	});
}

function isSessionBeforeEvent(event: RunnerEmitEvent): event is SessionBeforeEvent {
	return (
		event.type === "session_before_switch" ||
		event.type === "session_before_fork" ||
		event.type === "session_before_compact" ||
		event.type === "session_before_tree"
	);
}

export async function emitExtensionHook<TEvent extends RunnerEmitEvent>(
	state: HookDispatchState,
	event: TEvent,
): Promise<RunnerEmitResult<TEvent>> {
	if (state.isStale()) return undefined as RunnerEmitResult<TEvent>;
	let result: SessionBeforeEventResult | undefined;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get(event.type);
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const handlerResult = await handler(event, state.ctx);

				if (isSessionBeforeEvent(event) && handlerResult) {
					result = handlerResult as SessionBeforeEventResult;
					if (result.cancel) {
						return result as RunnerEmitResult<TEvent>;
					}
				}
			} catch (err) {
				recordHookError(state, ext.path, event.type, err);
			}
		}
	}

	return result as RunnerEmitResult<TEvent>;
}

export async function emitMessageEndHook(
	state: HookDispatchState,
	event: MessageEndEvent,
): Promise<AgentMessage | undefined> {
	if (state.isStale()) return undefined;
	let currentMessage = event.message;
	let modified = false;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("message_end");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const currentEvent: MessageEndEvent = { ...event, message: currentMessage };
				const handlerResult = (await handler(currentEvent, state.ctx)) as MessageEndEventResult | undefined;
				if (!handlerResult?.message) continue;

				if (handlerResult.message.role !== currentMessage.role) {
					state.emitError({
						extensionPath: ext.path,
						event: "message_end",
						error: "message_end handlers must return a message with the same role",
					});
					continue;
				}

				currentMessage = handlerResult.message;
				modified = true;
			} catch (err) {
				recordHookError(state, ext.path, "message_end", err);
			}
		}
	}

	return modified ? currentMessage : undefined;
}

export async function emitToolResultHook(
	state: HookDispatchState,
	event: ToolResultEvent,
): Promise<ToolResultEventResult | undefined> {
	if (state.isStale()) return undefined;
	const currentEvent: ToolResultEvent = { ...event };
	let modified = false;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("tool_result");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const handlerResult = (await handler(currentEvent, state.ctx)) as ToolResultEventResult | undefined;
				if (!handlerResult) continue;

				if (handlerResult.content !== undefined) {
					currentEvent.content = handlerResult.content;
					modified = true;
				}
				if (handlerResult.details !== undefined) {
					currentEvent.details = handlerResult.details;
					modified = true;
				}
				if (handlerResult.isError !== undefined) {
					currentEvent.isError = handlerResult.isError;
					modified = true;
				}
			} catch (err) {
				recordHookError(state, ext.path, "tool_result", err);
			}
		}
	}

	return modified
		? { content: currentEvent.content, details: currentEvent.details, isError: currentEvent.isError }
		: undefined;
}

export async function emitToolCallHook(
	state: HookDispatchState,
	event: ToolCallEvent,
): Promise<ToolCallEventResult | undefined> {
	if (state.isStale()) return undefined;
	let result: ToolCallEventResult | undefined;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("tool_call");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			const handlerResult = await handler(event, state.ctx);
			if (handlerResult) {
				result = handlerResult as ToolCallEventResult;
				if (result.block) return result;
			}
		}
	}

	return result;
}

export async function emitUserBashHook(
	state: HookDispatchState,
	event: UserBashEvent,
): Promise<UserBashEventResult | undefined> {
	if (state.isStale()) return undefined;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("user_bash");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const handlerResult = await handler(event, state.ctx);
				if (handlerResult) return handlerResult as UserBashEventResult;
			} catch (err) {
				recordHookError(state, ext.path, "user_bash", err);
			}
		}
	}

	return undefined;
}

export async function emitContextHook(state: HookDispatchState, messages: AgentMessage[]): Promise<AgentMessage[]> {
	if (state.isStale()) return messages;
	let currentMessages = structuredClone(messages);

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("context");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const event: ContextEvent = { type: "context", messages: currentMessages };
				const handlerResult = await handler(event, state.ctx);

				if (handlerResult && (handlerResult as ContextEventResult).messages) {
					currentMessages = (handlerResult as ContextEventResult).messages!;
				}
			} catch (err) {
				recordHookError(state, ext.path, "context", err);
			}
		}
	}

	return currentMessages;
}

export async function emitBeforeProviderRequestHook(state: HookDispatchState, payload: unknown): Promise<unknown> {
	if (state.isStale()) return payload;
	let currentPayload = payload;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("before_provider_request");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const event: BeforeProviderRequestEvent = { type: "before_provider_request", payload: currentPayload };
				const handlerResult = await handler(event, state.ctx);
				if (handlerResult !== undefined) currentPayload = handlerResult;
			} catch (err) {
				recordHookError(state, ext.path, "before_provider_request", err);
			}
		}
	}

	return currentPayload;
}

export async function emitBeforeAgentStartHook(options: {
	state: HookDispatchState;
	prompt: string;
	systemPrompt: string;
	systemPromptOptions: BuildSystemPromptOptions;
	getRuntimeSystemPrompt: () => string | undefined;
	assertActive: () => void;
}): Promise<BeforeAgentStartCombinedResult | undefined> {
	const { state, prompt, systemPrompt, systemPromptOptions, getRuntimeSystemPrompt, assertActive } = options;
	if (state.isStale()) return undefined;
	let currentSystemPrompt = systemPrompt;
	let observedRuntimeSystemPrompt = getRuntimeSystemPrompt() ?? systemPrompt;
	const syncRuntimeSystemPrompt = () => {
		const runtimeSystemPrompt = getRuntimeSystemPrompt() ?? currentSystemPrompt;
		if (runtimeSystemPrompt === observedRuntimeSystemPrompt) return;
		if (currentSystemPrompt === observedRuntimeSystemPrompt) {
			currentSystemPrompt = runtimeSystemPrompt;
		} else if (currentSystemPrompt.startsWith(observedRuntimeSystemPrompt)) {
			currentSystemPrompt = `${runtimeSystemPrompt}${currentSystemPrompt.slice(observedRuntimeSystemPrompt.length)}`;
		}
		observedRuntimeSystemPrompt = runtimeSystemPrompt;
	};
	const ctx = Object.defineProperties({}, Object.getOwnPropertyDescriptors(state.ctx)) as ExtensionContext;
	ctx.getSystemPrompt = () => {
		assertActive();
		syncRuntimeSystemPrompt();
		return currentSystemPrompt;
	};
	const messages: NonNullable<BeforeAgentStartEventResult["message"]>[] = [];
	let systemPromptModified = false;

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("before_agent_start");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				syncRuntimeSystemPrompt();
				const event: BeforeAgentStartEvent = {
					type: "before_agent_start",
					prompt,
					systemPrompt: currentSystemPrompt,
					systemPromptOptions,
				};
				const handlerResult = await handler(event, ctx);
				syncRuntimeSystemPrompt();

				if (handlerResult) {
					const result = handlerResult as BeforeAgentStartEventResult;
					if (result.message) messages.push(result.message);
					if (result.systemPrompt !== undefined) {
						currentSystemPrompt = result.systemPrompt;
						systemPromptModified = true;
					}
				}
			} catch (err) {
				recordHookError(state, ext.path, "before_agent_start", err);
			}
		}
	}

	if (messages.length > 0 || systemPromptModified) {
		return {
			messages: messages.length > 0 ? messages : undefined,
			systemPrompt: systemPromptModified ? currentSystemPrompt : undefined,
		};
	}

	return undefined;
}

export async function emitResourcesDiscoverHook(
	state: HookDispatchState,
	cwd: string,
	reason: ResourcesDiscoverEvent["reason"],
): Promise<{
	skillPaths: Array<{ path: string; extensionPath: string }>;
	promptPaths: Array<{ path: string; extensionPath: string }>;
	themePaths: Array<{ path: string; extensionPath: string }>;
}> {
	if (state.isStale()) return { skillPaths: [], promptPaths: [], themePaths: [] };
	const skillPaths: Array<{ path: string; extensionPath: string }> = [];
	const promptPaths: Array<{ path: string; extensionPath: string }> = [];
	const themePaths: Array<{ path: string; extensionPath: string }> = [];

	for (const ext of state.extensions) {
		const handlers = ext.handlers.get("resources_discover");
		if (!handlers || handlers.length === 0) continue;

		for (const handler of handlers) {
			try {
				const event: ResourcesDiscoverEvent = { type: "resources_discover", cwd, reason };
				const handlerResult = await handler(event, state.ctx);
				const result = handlerResult as ResourcesDiscoverResult | undefined;

				if (result?.skillPaths?.length) {
					skillPaths.push(...result.skillPaths.map((path) => ({ path, extensionPath: ext.path })));
				}
				if (result?.promptPaths?.length) {
					promptPaths.push(...result.promptPaths.map((path) => ({ path, extensionPath: ext.path })));
				}
				if (result?.themePaths?.length) {
					themePaths.push(...result.themePaths.map((path) => ({ path, extensionPath: ext.path })));
				}
			} catch (err) {
				recordHookError(state, ext.path, "resources_discover", err);
			}
		}
	}

	return { skillPaths, promptPaths, themePaths };
}

export async function emitInputHook(
	state: HookDispatchState,
	text: string,
	source: InputEvent["source"],
	streamingBehavior?: "steer" | "followUp",
): Promise<InputEventResult> {
	if (state.isStale()) return { action: "continue" };
	let currentText = text;

	for (const ext of state.extensions) {
		for (const handler of ext.handlers.get("input") ?? []) {
			try {
				const event: InputEvent = { type: "input", text: currentText, source, streamingBehavior };
				const result = (await handler(event, state.ctx)) as InputEventResult | undefined;
				if (result?.action === "handled") return result;
				if (result?.action === "transform") currentText = result.text;
			} catch (err) {
				recordHookError(state, ext.path, "input", err);
			}
		}
	}

	return currentText !== text ? { action: "transform", text: currentText } : { action: "continue" };
}
