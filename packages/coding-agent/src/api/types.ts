/**
 * Extension system public API types.
 *
 * Domain-specific definitions live in sibling files. This file remains the
 * package's aggregate public API entry point for extension types.
 */

export type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode } from "@tsuuanmi/pi-agent";
export * from "#coding-agent/api/context-types";
export * from "#coding-agent/api/extension-types";
export * from "#coding-agent/api/mcp-types";
export * from "#coding-agent/api/provider-types";
export * from "#coding-agent/api/tool-types";
export * from "#coding-agent/api/ui-types";
export type { ExecOptions, ExecResult } from "#coding-agent/exec/exec";
export * from "#coding-agent/hooks/event-types";
export * from "#coding-agent/hooks/extension-api-hooks";
export type { AppKeybinding, KeybindingsManager } from "#coding-agent/settings/keybindings";
export type { BuildSystemPromptOptions } from "#coding-agent/skills/system-prompt";
