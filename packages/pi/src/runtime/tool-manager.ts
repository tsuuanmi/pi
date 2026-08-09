import { resolveToolSelection, Tool, ToolRegistry } from "@tsuuanmi/pi-agent";
import type { ToolInfo } from "#pi/api/extension-types";
import { createSyntheticSourceInfo, type SourceInfo } from "#pi/resources/source-info";
import type { ExtensionRunner } from "#pi/runtime/extensions/runner";
import { toExtensionTool, toTool } from "#pi/tool/adapter";
import type { ExtensionToolSpec, PiToolSpec } from "#pi/tool/spec";

type BaseTool = PiToolSpec | Tool;

interface ToolEntry {
	tool: Tool;
	spec?: PiToolSpec | ExtensionToolSpec;
	sourceInfo: SourceInfo;
}

export interface ToolPrompts {
	snippets: Record<string, string>;
	guidelines: string[];
}

export interface ToolManagerOptions {
	customTools: Tool[];
	allowedNames?: string[];
	excludedNames?: string[];
	apply(names: string[], tools: Tool[]): void;
}

export class ToolManager {
	private readonly customTools: Tool[];
	private readonly allowedNames?: Set<string>;
	private readonly excludedNames?: Set<string>;
	private readonly apply: ToolManagerOptions["apply"];
	private registry = new ToolRegistry();
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
		baseTools: Map<string, BaseTool>,
		runner: ExtensionRunner,
		previousNames: string[],
		options: { activeNames?: string[]; includeAllExtensionTools?: boolean } = {},
	): void {
		const entries = new Map<string, ToolEntry>();
		for (const [name, input] of baseTools) {
			if (this.isAllowed(name)) {
				addEntry(
					entries,
					name,
					this.createBaseEntry(input, createSyntheticSourceInfo(`<builtin:${name}>`, { source: "builtin" })),
				);
			}
		}
		for (const tool of this.customTools) {
			if (this.isAllowed(tool.name)) {
				addEntry(entries, tool.name, {
					tool,
					sourceInfo: createSyntheticSourceInfo(`<sdk:${tool.name}>`, { source: "sdk" }),
				});
			}
		}
		for (const registered of runner.getAllRegisteredTools()) {
			if (this.isAllowed(registered.definition.name)) {
				addEntry(
					entries,
					registered.definition.name,
					this.createExtensionEntry(registered.definition, registered.sourceInfo, runner),
				);
			}
		}

		const registry = new ToolRegistry(Array.from(entries.values(), ({ tool }) => tool));
		this.entries = entries;
		this.registry = registry;
		this.snippets = new Map(
			Array.from(entries.values())
				.map(({ tool }) => [tool.name, normalizeSnippet(tool.promptSnippet)] as const)
				.filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
		);
		this.guidelines = new Map(
			Array.from(entries.values())
				.map(({ tool }) => [tool.name, normalizeGuidelines(tool.promptGuidelines)] as const)
				.filter((entry) => entry[1].length > 0),
		);

		const extensionNames = options.includeAllExtensionTools
			? Array.from(entries.values())
					.filter(({ sourceInfo }) => sourceInfo.source !== "builtin" && sourceInfo.source !== "sdk")
					.map(({ tool }) => tool.name)
			: [];
		const activeToolNames = options.includeAllExtensionTools
			? [...(options.activeNames ?? previousNames), ...extensionNames]
			: options.activeNames;
		const names = resolveToolSelection(this.registry.names(), previousNames, {
			activeToolNames,
			allowedToolNames: this.allowedNames,
			excludedToolNames: this.excludedNames,
			includeNewlyRegisteredTools: !activeToolNames,
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
		const active = resolveToolSelection(this.registry.names(), undefined, { activeToolNames: names });
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
		return Array.from(this.entries.values()).map(({ tool, sourceInfo }) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
			promptGuidelines: tool.promptGuidelines,
			sourceInfo,
		}));
	}

	get(name: string): PiToolSpec | ExtensionToolSpec | undefined {
		return this.entries.get(name)?.spec;
	}

	has(name: string): boolean {
		return this.registry.has(name);
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

	private createBaseEntry(input: BaseTool, sourceInfo: SourceInfo): ToolEntry {
		if (input instanceof Tool) return { tool: input, sourceInfo };
		return { tool: toTool(input), spec: input, sourceInfo };
	}

	private createExtensionEntry(spec: ExtensionToolSpec, sourceInfo: SourceInfo, runner: ExtensionRunner): ToolEntry {
		return {
			tool: toExtensionTool(spec, () => runner.createContext()),
			spec,
			sourceInfo,
		};
	}

	private isAllowed(name: string): boolean {
		return (!this.allowedNames || this.allowedNames.has(name)) && !this.excludedNames?.has(name);
	}
}

function addEntry(entries: Map<string, ToolEntry>, name: string, entry: ToolEntry): void {
	const existing = entries.get(name);
	if (!existing) {
		entries.set(name, entry);
		return;
	}

	const existingPriority = sourcePriority(existing.sourceInfo.source);
	const entryPriority = sourcePriority(entry.sourceInfo.source);
	if (entryPriority > existingPriority) {
		entries.set(name, entry);
		return;
	}
	if (entryPriority < existingPriority) {
		throw new Error(`Tool "${name}" conflicts with a higher-priority registration`);
	}
	throw new Error(`Tool "${name}" is already registered`);
}

/** Custom and extension tools intentionally replace built-ins; all other duplicates fail. */
function sourcePriority(source: string): number {
	if (source === "builtin") return 0;
	if (source === "sdk") return 1;
	return 2;
}

function normalizeSnippet(text: string | undefined): string | undefined {
	if (!text) return undefined;
	const normalized = text
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return normalized || undefined;
}

function normalizeGuidelines(guidelines: readonly string[] | undefined): string[] {
	return Array.from(new Set((guidelines ?? []).map((guideline) => guideline.trim()).filter(Boolean)));
}
