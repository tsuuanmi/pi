import type { ExtensionContext } from "#pi/api/context-types";
import type { ExtensionEvent } from "#pi/hooks/events";
import type { ExtensionHookMap, ExtensionHookType } from "#pi/hooks/hook-types";

export type ExtensionEventHandler<TEvent extends ExtensionEvent = ExtensionEvent> = (
	event: TEvent,
	ctx: ExtensionContext,
) => Promise<void> | void;

export type ExtensionHookHandler<TType extends ExtensionHookType = ExtensionHookType> = (
	hook: ExtensionHookMap[TType]["hook"],
	ctx: ExtensionContext,
) =>
	| Promise<ExtensionHookMap[TType]["result"] | undefined>
	| Promise<void>
	| ExtensionHookMap[TType]["result"]
	| undefined;

/** Observer-only extension registration. Event handler return values are ignored. */
export interface ExtensionEventAPI {
	on<TType extends ExtensionEvent["type"]>(
		type: TType,
		handler: ExtensionEventHandler<Extract<ExtensionEvent, { type: TType }>>,
	): void;
}

/** Control-hook registration. Hook results can alter host execution. */
export interface ExtensionHookAPI {
	onHook<TType extends ExtensionHookType>(type: TType, handler: ExtensionHookHandler<TType>): void;
}
