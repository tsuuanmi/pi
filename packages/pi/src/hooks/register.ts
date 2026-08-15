import type { Extension, ExtensionRuntime } from "#pi/api/extension-types";
import type { ExtensionEvent } from "#pi/hooks/events";
import type { ExtensionHookType } from "#pi/hooks/hook-types";

export type EventHandlerFn = (...args: unknown[]) => Promise<void> | void;
export type HookHandlerFn = (...args: unknown[]) => Promise<unknown> | unknown;

export function registerExtensionEvent(
	extension: Extension,
	runtime: ExtensionRuntime,
	type: ExtensionEvent["type"],
	handler: EventHandlerFn,
): void {
	runtime.assertActive();
	const handlers = extension.eventHandlers.get(type) ?? [];
	handlers.push(handler);
	extension.eventHandlers.set(type, handlers);
}

export function registerExtensionHook(
	extension: Extension,
	runtime: ExtensionRuntime,
	type: ExtensionHookType,
	handler: HookHandlerFn,
): void {
	runtime.assertActive();
	const handlers = extension.hookHandlers.get(type) ?? [];
	handlers.push(handler);
	extension.hookHandlers.set(type, handlers);
}
