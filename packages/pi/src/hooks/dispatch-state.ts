import type { ExtensionContext } from "#pi/api/context-types";
import type { Extension, ExtensionError } from "#pi/api/extension-types";

export type ExtensionErrorEmitter = (error: ExtensionError) => void;

export interface ExtensionDispatchState {
	extensions: Extension[];
	ctx: ExtensionContext;
	emitError: ExtensionErrorEmitter;
	isStale: () => boolean;
}

export function recordExtensionError(
	state: ExtensionDispatchState,
	extensionPath: string,
	type: string,
	error: unknown,
): void {
	state.emitError({
		extensionPath,
		event: type,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
}
