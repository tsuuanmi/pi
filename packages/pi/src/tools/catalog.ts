import type { Tool } from "@tsuuanmi/pi-agent";

import { toTool } from "#pi/tool/adapter";
import type { PiToolSpec } from "#pi/tool/spec";
import { type BashToolOptions, createBashSpec } from "#pi/tools/bash";
import { createEditSpec, type EditToolOptions } from "#pi/tools/edit";
import { createFindSpec, type FindToolOptions } from "#pi/tools/find";
import { createGlobSpec, type GlobToolOptions } from "#pi/tools/glob";
import { createGrepSpec, type GrepToolOptions } from "#pi/tools/grep";
import { createLsSpec, type LsToolOptions } from "#pi/tools/ls";
import { createLspSpec } from "#pi/tools/lsp/index";
import { createReadSpec, type ReadToolOptions } from "#pi/tools/read";
import { createWriteSpec, type WriteToolOptions } from "#pi/tools/write";

export type ToolName = "read" | "bash" | "edit" | "write" | "lsp" | "grep" | "find" | "glob" | "ls";

export interface ToolsOptions {
	read?: ReadToolOptions;
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	edit?: EditToolOptions;
	grep?: GrepToolOptions;
	find?: FindToolOptions;
	glob?: GlobToolOptions;
	ls?: LsToolOptions;
}

type ToolFactory = (cwd: string, options: ToolsOptions) => PiToolSpec<any, any, any>;

const toolNames: readonly ToolName[] = ["read", "bash", "edit", "write", "lsp", "grep", "find", "glob", "ls"];
const codingToolNames: readonly ToolName[] = ["read", "bash", "edit", "write", "lsp"];
const readOnlyToolNames: readonly ToolName[] = ["read", "lsp", "grep", "find", "glob", "ls"];

const toolFactories: Record<ToolName, ToolFactory> = {
	read: (cwd, options) => createReadSpec(cwd, options.read),
	bash: (cwd, options) => createBashSpec(cwd, options.bash),
	edit: (cwd, options) => createEditSpec(cwd, options.edit),
	write: (cwd, options) => createWriteSpec(cwd, options.write),
	lsp: (cwd) => createLspSpec(cwd),
	grep: (cwd, options) => createGrepSpec(cwd, options.grep),
	find: (cwd, options) => createFindSpec(cwd, options.find),
	glob: (cwd, options) => createGlobSpec(cwd, options.glob),
	ls: (cwd, options) => createLsSpec(cwd, options.ls),
};

export function createToolSpecs(cwd: string, options: ToolsOptions = {}): Record<ToolName, PiToolSpec<any, any, any>> {
	return Object.fromEntries(toolNames.map((name) => [name, toolFactories[name](cwd, options)])) as Record<
		ToolName,
		PiToolSpec<any, any, any>
	>;
}

function createTools(names: readonly ToolName[], cwd: string, options: ToolsOptions = {}): Tool[] {
	return names.map((name) => toTool(toolFactories[name](cwd, options)));
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return createTools(codingToolNames, cwd, options);
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return createTools(readOnlyToolNames, cwd, options);
}
