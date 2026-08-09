import type { ToolResult } from "@tsuuanmi/pi-agent";
import type { Component, Theme } from "@tsuuanmi/pi-tui";
import type { Static, TSchema } from "typebox";

export interface ToolRenderResultOptions {
	expanded: boolean;
	isPartial: boolean;
}

export interface ToolRenderContext<TState = any, TArgs = any> {
	args: TArgs;
	toolCallId: string;
	invalidate: () => void;
	lastComponent: Component | undefined;
	state: TState;
	cwd: string;
	executionStarted: boolean;
	argsComplete: boolean;
	isPartial: boolean;
	expanded: boolean;
	isError: boolean;
}

export type ToolCallRenderer<TParams extends TSchema = TSchema, TState = any> = (
	args: Static<TParams>,
	theme: Theme,
	context: ToolRenderContext<TState, Static<TParams>>,
) => Component;

export type ToolResultRenderer<TParams extends TSchema = TSchema, TDetails = any, TState = any> = (
	result: ToolResult<TDetails>,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext<TState, Static<TParams>>,
) => Component;
