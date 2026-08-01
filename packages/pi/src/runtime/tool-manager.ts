import type { AgentTool, ToolRegistry } from "@tsuuanmi/pi-agent";
import { createToolRegistry, registerTool, resolveToolSelection } from "@tsuuanmi/pi-agent";
import type { RegisteredTool, ToolInfo } from "#pi/api/extension-types";
import type { ToolDefinition } from "#pi/api/tool-types";
import type { ExtensionRunner } from "#pi/extensions/runner";
import { wrapRegisteredTools } from "#pi/extensions/wrapper";
import { createSyntheticSourceInfo, type SourceInfo } from "#pi/package-manager/source-info";

interface ToolEntry {
	definition: ToolDefinition;
	sourceInfo: SourceInfo;
}

export interface ToolPrompts {
	snippets: Record<string, string>;
	guidelines: string[];
}

export interface ToolManagerOptions {
	customTools: ToolDefinition[];
	allowedNames?: string[];
	excludedNames?: string[];
	apply(names: string[], tools: AgentTool[]): void;
}

export class ToolManager {
	private readonly customTools: ToolDefinition[];
	private readonly allowedNames?: Set<string>;
	private readonly excludedNames?: Set<string>;
	private readonly apply: ToolManagerOptions["apply"];
	private registry: ToolRegistry = createToolRegistry();
	private entries = new Map<string, ToolEntry>();
	private snippets = new Map<string, string>();
	private guidelines = new Map<string, string[]>();

	constructor(options: ToolManagerOptions) {
		this.customTools = options.customTools;
		this.allowedNames = options.allowedNames ? new Set(options.allowedNames) : undefined;
		this.excludedNames = options.excludedNames ? new Set(options.excludedNames) : undefined;
		this.apply = options.apply;
	}

	refresh(
		baseTools: Map<string, ToolDefinition>,
		runner: ExtensionRunner,
		previousNames: string[],
		options: { activeNames?: string[]; includeAllExtensionTools?: boolean } = {},
	): void {
		const extensionTools = runner.getAllRegisteredTools();
		const entries = new Map<string, ToolEntry>();
		for (const [name, definition] of baseTools) {
			if (this.isAllowed(name)) {
				entries.set(name, {
					definition,
					sourceInfo: createSyntheticSourceInfo(`<builtin:${name}>`, { source: "builtin" }),
				});
			}
		}
		for (const definition of this.customTools) {
			if (this.isAllowed(definition.name)) {
				entries.set(definition.name, {
					definition,
					sourceInfo: createSyntheticSourceInfo(`<sdk:${definition.name}>`, { source: "sdk" }),
				});
			}
		}
		for (const registered of extensionTools) {
			if (this.isAllowed(registered.definition.name)) {
				entries.set(registered.definition.name, {
					definition: registered.definition,
					sourceInfo: registered.sourceInfo,
				});
			}
		}

		const wrappedBuiltIns = wrapRegisteredTools(
			Array.from(entries.values())
				.filter(({ sourceInfo }) => sourceInfo.source === "builtin")
				.map(({ definition, sourceInfo }) => ({ definition, sourceInfo }) as RegisteredTool),
			runner,
		);
		const wrappedCustom = wrapRegisteredTools(
			Array.from(entries.values())
				.filter(({ sourceInfo }) => sourceInfo.source === "sdk")
				.map(({ definition, sourceInfo }) => ({ definition, sourceInfo }) as RegisteredTool),
			runner,
		);
		const wrappedExtensions = wrapRegisteredTools(
			Array.from(entries.values())
				.filter(({ sourceInfo }) => sourceInfo.source !== "builtin" && sourceInfo.source !== "sdk")
				.map(({ definition, sourceInfo }) => ({ definition, sourceInfo }) as RegisteredTool),
			runner,
		);
		const registry = createToolRegistry(wrappedBuiltIns);
		registerTool(registry, [...wrappedCustom, ...wrappedExtensions]);

		this.entries = entries;
		this.registry = registry;
		this.snippets = new Map(
			Array.from(entries.values())
				.map(({ definition }) => [definition.name, normalizeSnippet(definition.promptSnippet)] as const)
				.filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
		);
		this.guidelines = new Map(
			Array.from(entries.values())
				.map(({ definition }) => [definition.name, normalizeGuidelines(definition.promptGuidelines)] as const)
				.filter((entry) => entry[1].length > 0),
		);

		const names = resolveToolSelection(this.registry.names(), previousNames, {
			activeToolNames: options.activeNames,
			allowedToolNames: this.allowedNames,
			excludedToolNames: this.excludedNames,
			includeNewlyRegisteredTools: !options.activeNames && !options.includeAllExtensionTools,
			includeAllRegisteredTools: options.includeAllExtensionTools,
		});
		this.apply(
			names,
			names.flatMap((name) => {
				const tool = this.registry.get(name);
				return tool ? [tool] : [];
			}),
		);
	}

	setActiveNames(names: string[]): void {
		const active = resolveToolSelection(this.registry.names(), undefined, {
			activeToolNames: names,
		});
		this.apply(
			active,
			active.flatMap((name) => {
				const tool = this.registry.get(name);
				return tool ? [tool] : [];
			}),
		);
	}

	customNames(): string[] {
		return this.customTools.map((tool) => tool.name);
	}

	getAll(): ToolInfo[] {
		return Array.from(this.entries.values()).map(({ definition, sourceInfo }) => ({
			name: definition.name,
			description: definition.description,
			parameters: definition.parameters,
			promptGuidelines: definition.promptGuidelines,
			sourceInfo,
		}));
	}

	get(name: string): ToolDefinition | undefined {
		return this.entries.get(name)?.definition;
	}

	has(name: string): boolean {
		return this.registry.has(name);
	}

	private isAllowed(name: string): boolean {
		return (!this.allowedNames || this.allowedNames.has(name)) && !this.excludedNames?.has(name);
	}

	getPrompts(names: string[]): ToolPrompts {
		const snippets: Record<string, string> = {};
		const guidelines: string[] = [];
		for (const name of names) {
			const snippet = this.snippets.get(name);
			if (snippet) snippets[name] = snippet;
			const toolGuidelines = this.guidelines.get(name);
			if (toolGuidelines) guidelines.push(...toolGuidelines);
		}
		return { snippets, guidelines };
	}
}

function normalizeSnippet(text: string | undefined): string | undefined {
	if (!text) return undefined;
	const normalized = text
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return normalized || undefined;
}

function normalizeGuidelines(guidelines: string[] | undefined): string[] {
	return Array.from(new Set((guidelines ?? []).map((guideline) => guideline.trim()).filter(Boolean)));
}
