import type { Static, TSchema } from "typebox";
import type { ToolExecutionMode } from "#agent/config";
import type { ToolResult, ToolUpdate } from "#agent/tool/result";

export interface ToolSpec<TParameters extends TSchema = TSchema, TDetails = unknown> {
	name: string;
	label: string;
	description: string;
	parameters: TParameters;
	promptSnippet?: string;
	promptGuidelines?: readonly string[];
	prepareArguments?: (args: unknown) => Static<TParameters>;
	executionMode?: ToolExecutionMode;
	detailsSchema?: TSchema;
	maxOutputChars?: number;
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: ToolUpdate<TDetails>,
	) => Promise<ToolResult<TDetails>>;
}

export class Tool<TParameters extends TSchema = TSchema, TDetails = unknown> {
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly parameters: TParameters;
	readonly promptSnippet?: string;
	readonly promptGuidelines?: readonly string[];
	readonly prepareArguments?: (args: unknown) => Static<TParameters>;
	readonly executionMode?: ToolExecutionMode;
	readonly detailsSchema?: TSchema;
	readonly maxOutputChars?: number;
	readonly execute: ToolSpec<TParameters, TDetails>["execute"];

	private constructor(spec: ToolSpec<TParameters, TDetails>) {
		this.name = spec.name;
		this.label = spec.label;
		this.description = spec.description;
		this.parameters = spec.parameters;
		this.promptSnippet = spec.promptSnippet;
		this.promptGuidelines = spec.promptGuidelines;
		this.prepareArguments = spec.prepareArguments;
		this.executionMode = spec.executionMode;
		this.detailsSchema = spec.detailsSchema;
		this.maxOutputChars = spec.maxOutputChars;
		this.execute = spec.execute;
	}

	static define<TParameters extends TSchema, TDetails = unknown>(
		spec: ToolSpec<TParameters, TDetails>,
	): Tool<TParameters, TDetails> {
		assertText(spec.name, "Tool name is required");
		assertText(spec.description, "Tool description is required");
		assertText(spec.label, "Tool label is required");
		assertSchema(spec.parameters, "Tool parameters are required");
		if (typeof spec.execute !== "function") throw new Error("Tool execute function is required");
		return Object.freeze(
			new Tool({
				...spec,
				promptGuidelines: spec.promptGuidelines ? Object.freeze([...spec.promptGuidelines]) : undefined,
			}),
		);
	}
}

function assertText(value: unknown, message: string): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(message);
	}
}

function assertSchema(value: unknown, message: string): void {
	if (value === null || typeof value !== "object") throw new Error(message);
}
