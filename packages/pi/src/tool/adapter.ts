import { Tool } from "@tsuuanmi/pi-agent";
import type { TSchema } from "typebox";
import type { ExtensionContext } from "#pi/api/context-types";
import type { ExtensionToolSpec, PiToolSpec } from "#pi/tool/spec";

export function toTool<TParams extends TSchema, TDetails = unknown>(
	spec: PiToolSpec<TParams, TDetails>,
): Tool<TParams, TDetails> {
	return Tool.define(spec);
}

export function toExtensionTool<TParams extends TSchema, TDetails = unknown>(
	spec: ExtensionToolSpec<TParams, TDetails>,
	context: () => ExtensionContext,
): Tool<TParams, TDetails> {
	return Tool.define<TParams, TDetails>({
		name: spec.name,
		label: spec.label,
		description: spec.description,
		parameters: spec.parameters,
		promptSnippet: spec.promptSnippet,
		promptGuidelines: spec.promptGuidelines,
		prepareArguments: spec.prepareArguments,
		executionMode: spec.executionMode,
		detailsSchema: spec.detailsSchema,
		maxOutputChars: spec.maxOutputChars,
		execute: (toolCallId, params, signal, onUpdate) => spec.execute(toolCallId, params, signal, onUpdate, context()),
	});
}
