import type { ContextToolSpec, ToolSpec } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import type { ExtensionContext } from "#pi/api/context-types";
import type { ToolCallRenderer, ToolResultRenderer } from "#pi/tool/render";

export interface PiToolSpec<TParams extends TSchema = TSchema, TDetails = any, TState = any>
	extends Omit<ToolSpec<TParams, TDetails>, "execute"> {
	renderShell?: "default" | "self";
	execute: ToolSpec<TParams, TDetails>["execute"];
	renderCall?: ToolCallRenderer<TParams, TState>;
	renderResult?: ToolResultRenderer<TParams, TDetails, TState>;
}

export interface ExtensionToolSpec<TParams extends TSchema = TSchema, TDetails = any, TState = any>
	extends ContextToolSpec<ExtensionContext, TParams, TDetails> {
	renderShell?: "default" | "self";
	renderCall?: ToolCallRenderer<TParams, TState>;
	renderResult?: ToolResultRenderer<TParams, TDetails, TState>;
}

export type {
	ToolCallRenderer,
	ToolRenderContext,
	ToolRenderResultOptions,
	ToolResultRenderer,
} from "#pi/tool/render";
