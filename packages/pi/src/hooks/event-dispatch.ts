import type { Extension } from "#pi/api/extension-types";
import type { ExtensionDispatchState } from "#pi/hooks/dispatch-state";
import { recordExtensionError } from "#pi/hooks/dispatch-state";
import type { ExtensionEvent } from "#pi/hooks/events";

export function hasExtensionEventHandlers(
	extensions: Extension[],
	isStale: () => boolean,
	type: ExtensionEvent["type"],
): boolean {
	if (isStale()) return false;
	return extensions.some((extension) => (extension.eventHandlers.get(type)?.length ?? 0) > 0);
}

export async function emitExtensionEvent(state: ExtensionDispatchState, event: ExtensionEvent): Promise<void> {
	if (state.isStale()) return;

	for (const extension of state.extensions) {
		for (const handler of extension.eventHandlers.get(event.type) ?? []) {
			try {
				await handler(event, state.ctx);
			} catch (error) {
				recordExtensionError(state, extension.path, event.type, error);
			}
		}
	}
}
