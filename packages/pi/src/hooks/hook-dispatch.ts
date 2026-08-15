import type { AgentMessage } from "@tsuuanmi/pi-agent";
import type { ExtensionContext } from "#pi/api/context-types";
import type { Extension } from "#pi/api/extension-types";
import type { ExtensionDispatchState } from "#pi/hooks/dispatch-state";
import { recordExtensionError } from "#pi/hooks/dispatch-state";
import type {
	BeforeAgentStartHook,
	BeforeAgentStartHookResult,
	BeforeProviderRequestHook,
	ContextHook,
	ContextHookResult,
	ExtensionHookMap,
	ExtensionHookType,
	InputHook,
	InputHookResult,
	MessageEndHook,
	MessageEndHookResult,
	ResourcesDiscoverHook,
	ResourcesDiscoverHookResult,
	SessionBeforeCompactHookResult,
	SessionBeforeSwitchHookResult,
	SessionBeforeTreeHookResult,
	ToolCallHook,
	ToolCallHookResult,
	ToolResultHook,
	ToolResultHookResult,
	UserBashHook,
	UserBashHookResult,
} from "#pi/hooks/hook-types";
import type { BuildSystemPromptOptions } from "#pi/loader/agents/system-prompt";

export interface BeforeAgentStartCombinedResult {
	messages?: NonNullable<BeforeAgentStartHookResult["message"]>[];
	systemPrompt?: string;
}

type SessionBeforeHookType = "session_before_switch" | "session_before_compact" | "session_before_tree";
type SessionBeforeHookResult =
	| SessionBeforeSwitchHookResult
	| SessionBeforeCompactHookResult
	| SessionBeforeTreeHookResult;

export function hasExtensionHookHandlers(
	extensions: Extension[],
	isStale: () => boolean,
	type: ExtensionHookType,
): boolean {
	if (isStale()) return false;
	return extensions.some((extension) => (extension.hookHandlers.get(type)?.length ?? 0) > 0);
}

export async function emitSessionHook<TType extends SessionBeforeHookType>(
	state: ExtensionDispatchState,
	hook: ExtensionHookMap[TType]["hook"],
): Promise<ExtensionHookMap[TType]["result"] | undefined> {
	if (state.isStale()) return undefined;
	let result: SessionBeforeHookResult | undefined;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get(hook.type) ?? []) {
			try {
				const handlerResult = await handler(hook, state.ctx);
				if (!handlerResult) continue;
				result = handlerResult as SessionBeforeHookResult;
				if (result.cancel) return result as ExtensionHookMap[TType]["result"];
			} catch (error) {
				recordExtensionError(state, extension.path, hook.type, error);
			}
		}
	}

	return result as ExtensionHookMap[TType]["result"] | undefined;
}

export async function emitMessageEndHook(
	state: ExtensionDispatchState,
	hook: MessageEndHook,
): Promise<AgentMessage | undefined> {
	if (state.isStale()) return undefined;
	let currentMessage = hook.message;
	let modified = false;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("message_end") ?? []) {
			try {
				const currentHook: MessageEndHook = { ...hook, message: currentMessage };
				const result = (await handler(currentHook, state.ctx)) as MessageEndHookResult | undefined;
				if (!result?.message) continue;

				if (result.message.role !== currentMessage.role) {
					state.emitError({
						extensionPath: extension.path,
						event: "message_end",
						error: "message_end hooks must return a message with the same role",
					});
					continue;
				}

				currentMessage = result.message;
				modified = true;
			} catch (error) {
				recordExtensionError(state, extension.path, "message_end", error);
			}
		}
	}

	return modified ? currentMessage : undefined;
}

export async function emitToolResultHook(
	state: ExtensionDispatchState,
	hook: ToolResultHook,
): Promise<ToolResultHookResult | undefined> {
	if (state.isStale()) return undefined;
	const currentHook: ToolResultHook = { ...hook };
	let modified = false;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("tool_result") ?? []) {
			try {
				const result = (await handler(currentHook, state.ctx)) as ToolResultHookResult | undefined;
				if (!result) continue;

				if (result.content !== undefined) {
					currentHook.content = result.content;
					modified = true;
				}
				if (result.details !== undefined) {
					currentHook.details = result.details;
					modified = true;
				}
				if (result.isError !== undefined) {
					currentHook.isError = result.isError;
					modified = true;
				}
			} catch (error) {
				recordExtensionError(state, extension.path, "tool_result", error);
			}
		}
	}

	return modified
		? { content: currentHook.content, details: currentHook.details, isError: currentHook.isError }
		: undefined;
}

export async function emitToolCallHook(
	state: ExtensionDispatchState,
	hook: ToolCallHook,
): Promise<ToolCallHookResult | undefined> {
	if (state.isStale()) return undefined;
	let result: ToolCallHookResult | undefined;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("tool_call") ?? []) {
			const handlerResult = await handler(hook, state.ctx);
			if (!handlerResult) continue;
			result = handlerResult as ToolCallHookResult;
			if (result.block) return result;
		}
	}

	return result;
}

export async function emitUserBashHook(
	state: ExtensionDispatchState,
	hook: UserBashHook,
): Promise<UserBashHookResult | undefined> {
	if (state.isStale()) return undefined;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("user_bash") ?? []) {
			try {
				const result = await handler(hook, state.ctx);
				if (result) return result as UserBashHookResult;
			} catch (error) {
				recordExtensionError(state, extension.path, "user_bash", error);
			}
		}
	}

	return undefined;
}

export async function emitContextHook(
	state: ExtensionDispatchState,
	messages: AgentMessage[],
): Promise<AgentMessage[]> {
	if (state.isStale()) return messages;
	let currentMessages = structuredClone(messages);

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("context") ?? []) {
			try {
				const hook: ContextHook = { type: "context", messages: currentMessages };
				const result = (await handler(hook, state.ctx)) as ContextHookResult | undefined;
				if (result?.messages) currentMessages = result.messages;
			} catch (error) {
				recordExtensionError(state, extension.path, "context", error);
			}
		}
	}

	return currentMessages;
}

export async function emitBeforeProviderRequestHook(state: ExtensionDispatchState, payload: unknown): Promise<unknown> {
	if (state.isStale()) return payload;
	let currentPayload = payload;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("before_provider_request") ?? []) {
			try {
				const hook: BeforeProviderRequestHook = { type: "before_provider_request", payload: currentPayload };
				const result = await handler(hook, state.ctx);
				if (result !== undefined) currentPayload = result;
			} catch (error) {
				recordExtensionError(state, extension.path, "before_provider_request", error);
			}
		}
	}

	return currentPayload;
}

export async function emitBeforeAgentStartHook(options: {
	state: ExtensionDispatchState;
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
	const messages: NonNullable<BeforeAgentStartHookResult["message"]>[] = [];
	let systemPromptModified = false;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("before_agent_start") ?? []) {
			try {
				syncRuntimeSystemPrompt();
				const hook: BeforeAgentStartHook = {
					type: "before_agent_start",
					prompt,
					systemPrompt: currentSystemPrompt,
					systemPromptOptions,
				};
				const handlerResult = await handler(hook, ctx);
				syncRuntimeSystemPrompt();

				if (handlerResult) {
					const result = handlerResult as BeforeAgentStartHookResult;
					if (result.message) messages.push(result.message);
					if (result.systemPrompt !== undefined) {
						currentSystemPrompt = result.systemPrompt;
						systemPromptModified = true;
					}
				}
			} catch (error) {
				recordExtensionError(state, extension.path, "before_agent_start", error);
			}
		}
	}

	if (messages.length === 0 && !systemPromptModified) return undefined;
	return {
		messages: messages.length > 0 ? messages : undefined,
		systemPrompt: systemPromptModified ? currentSystemPrompt : undefined,
	};
}

export async function emitResourcesDiscoverHook(
	state: ExtensionDispatchState,
	cwd: string,
	reason: ResourcesDiscoverHook["reason"],
): Promise<{
	skillPaths: Array<{ path: string; extensionPath: string }>;
	promptPaths: Array<{ path: string; extensionPath: string }>;
	themePaths: Array<{ path: string; extensionPath: string }>;
}> {
	if (state.isStale()) return { skillPaths: [], promptPaths: [], themePaths: [] };
	const skillPaths: Array<{ path: string; extensionPath: string }> = [];
	const promptPaths: Array<{ path: string; extensionPath: string }> = [];
	const themePaths: Array<{ path: string; extensionPath: string }> = [];

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("resources_discover") ?? []) {
			try {
				const hook: ResourcesDiscoverHook = { type: "resources_discover", cwd, reason };
				const result = (await handler(hook, state.ctx)) as ResourcesDiscoverHookResult | undefined;
				if (result?.skillPaths?.length) {
					skillPaths.push(...result.skillPaths.map((path) => ({ path, extensionPath: extension.path })));
				}
				if (result?.promptPaths?.length) {
					promptPaths.push(...result.promptPaths.map((path) => ({ path, extensionPath: extension.path })));
				}
				if (result?.themePaths?.length) {
					themePaths.push(...result.themePaths.map((path) => ({ path, extensionPath: extension.path })));
				}
			} catch (error) {
				recordExtensionError(state, extension.path, "resources_discover", error);
			}
		}
	}

	return { skillPaths, promptPaths, themePaths };
}

export async function emitInputHook(
	state: ExtensionDispatchState,
	text: string,
	source: InputHook["source"],
	streamingBehavior?: "steer" | "followUp",
): Promise<InputHookResult> {
	if (state.isStale()) return { action: "continue" };
	let currentText = text;

	for (const extension of state.extensions) {
		for (const handler of extension.hookHandlers.get("input") ?? []) {
			try {
				const hook: InputHook = { type: "input", text: currentText, source, streamingBehavior };
				const result = (await handler(hook, state.ctx)) as InputHookResult | undefined;
				if (result?.action === "handled") return result;
				if (result?.action === "transform") currentText = result.text;
			} catch (error) {
				recordExtensionError(state, extension.path, "input", error);
			}
		}
	}

	return currentText !== text ? { action: "transform", text: currentText } : { action: "continue" };
}
