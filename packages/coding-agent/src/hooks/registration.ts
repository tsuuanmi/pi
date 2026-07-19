import type { Extension, ExtensionRuntime } from "#coding-agent/api/types";

export type HookHandlerFn = (...args: unknown[]) => Promise<unknown>;

/** Register an extension hook handler on the loaded extension record. */
export function registerExtensionHook(
	extension: Extension,
	runtime: ExtensionRuntime,
	event: string,
	handler: HookHandlerFn,
): void {
	runtime.assertActive();
	const list = extension.handlers.get(event) ?? [];
	list.push(handler);
	extension.handlers.set(event, list);
}
