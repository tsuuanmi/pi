import type { AgentTool } from "@tsuuanmi/pi-agent";
import type { ToolDefinition } from "#pi/api/tool-types";
import { type BashToolOptions, createBashToolDefinition } from "#pi/tools/bash";
import { createEditToolDefinition, type EditToolOptions } from "#pi/tools/edit";
import { createFindToolDefinition, type FindToolOptions } from "#pi/tools/find";
import { createGlobToolDefinition, type GlobToolOptions } from "#pi/tools/glob";
import { createGrepToolDefinition, type GrepToolOptions } from "#pi/tools/grep";
import { createLsToolDefinition, type LsToolOptions } from "#pi/tools/ls";
import { createLspToolDefinition } from "#pi/tools/lsp/index";
import { createReadToolDefinition, type ReadToolOptions } from "#pi/tools/read";
import { toAgentTool } from "#pi/tools/utils";
import { createWriteToolDefinition, type WriteToolOptions } from "#pi/tools/write";

export type Tool = AgentTool<any>;
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

type ToolFactory = (cwd: string, options: ToolsOptions) => ToolDefinition<any, any>;

const toolNames: readonly ToolName[] = ["read", "bash", "edit", "write", "lsp", "grep", "find", "glob", "ls"];
const codingToolNames: readonly ToolName[] = ["read", "bash", "edit", "write", "lsp"];
const readOnlyToolNames: readonly ToolName[] = ["read", "lsp", "grep", "find", "glob", "ls"];

const toolFactories: Record<ToolName, ToolFactory> = {
	read: (cwd, options) => createReadToolDefinition(cwd, options.read),
	bash: (cwd, options) => createBashToolDefinition(cwd, options.bash),
	edit: (cwd, options) => createEditToolDefinition(cwd, options.edit),
	write: (cwd, options) => createWriteToolDefinition(cwd, options.write),
	lsp: (cwd) => createLspToolDefinition(cwd),
	grep: (cwd, options) => createGrepToolDefinition(cwd, options.grep),
	find: (cwd, options) => createFindToolDefinition(cwd, options.find),
	glob: (cwd, options) => createGlobToolDefinition(cwd, options.glob),
	ls: (cwd, options) => createLsToolDefinition(cwd, options.ls),
};

export function createToolDefinitions(
	cwd: string,
	options: ToolsOptions = {},
): Record<ToolName, ToolDefinition<any, any>> {
	return Object.fromEntries(toolNames.map((name) => [name, toolFactories[name](cwd, options)])) as Record<
		ToolName,
		ToolDefinition<any, any>
	>;
}

function createTools(names: readonly ToolName[], cwd: string, options: ToolsOptions = {}): Tool[] {
	return names.map((name) => toAgentTool(toolFactories[name](cwd, options)));
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return createTools(codingToolNames, cwd, options);
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return createTools(readOnlyToolNames, cwd, options);
}
