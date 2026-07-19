/**
 * Extension system public API types.
 *
 * Domain-specific definitions live in sibling files. This file remains the
 * package's aggregate public API entry point for extension types.
 */

export type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode } from "@tsuuanmi/pi-agent";
export * from "#pi/api/context-types";
export * from "#pi/api/extension-types";
export * from "#pi/api/mcp-types";
export * from "#pi/api/provider-types";
export * from "#pi/api/tool-types";
export * from "#pi/api/ui-types";
export type { ExecOptions, ExecResult } from "#pi/exec/exec";
export * from "#pi/hooks/event-types";
export * from "#pi/hooks/extension-api-hooks";
export type { AppKeybinding, KeybindingsManager } from "#pi/settings/keybindings";
export type { BuildSystemPromptOptions } from "#pi/skills/system-prompt";
