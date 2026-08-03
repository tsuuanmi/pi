import type { Model } from "#ai/model/index";
import type { Api } from "#ai/protocol/ids";

export type AnyModel = Model<Api>;
export type ModelInput = AnyModel["input"];
export type ThinkingLevelMap = NonNullable<AnyModel["thinkingLevelMap"]>;

export interface ModelsDevModel {
	id: string;
	name?: string;
	tool_call?: boolean;
	reasoning?: boolean;
	reasoning_options?: { type?: string; values?: string[] }[];
	modalities?: {
		input?: string[];
	};
	limit?: {
		context?: number;
		input?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
	};
}

export interface ModelsDevProvider {
	api?: string;
	models?: Record<string, ModelsDevModel>;
}

export interface ModelsDevCatalog {
	providers?: Record<string, ModelsDevProvider>;
}

export interface CodexReasoningLevel {
	effort: string;
	description?: string;
}

export interface CodexCatalogModel {
	slug: string;
	display_name?: string;
	description?: string;
	context_window?: number;
	max_context_window?: number;
	input_modalities?: string[];
	default_reasoning_level?: string;
	supported_reasoning_levels?: CodexReasoningLevel[];
	support_verbosity?: boolean;
	visibility?: "list" | "hidden" | string;
	supported_in_api?: boolean;
}

export interface CodexCatalog {
	models: CodexCatalogModel[];
}

export interface Catalogs {
	modelsDev: ModelsDevCatalog;
	codex: CodexCatalog;
}
