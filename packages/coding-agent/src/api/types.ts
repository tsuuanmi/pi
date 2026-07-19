/**
 * Extension system public API types.
 *
 * Domain-specific definitions live in sibling files. This file remains the
 * package's aggregate public API entry point for extension types.
 */

export type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode } from "@tsuuanmi/pi-agent";
export * from "#coding-agent/api/context-types";
export * from "#coding-agent/api/event-types";
export * from "#coding-agent/api/extension-types";
export * from "#coding-agent/api/provider-types";
export * from "#coding-agent/api/tool-types";
export * from "#coding-agent/api/ui-types";
export type { ExecOptions, ExecResult } from "#coding-agent/core/exec/exec";
export type { AppKeybinding, KeybindingsManager } from "#coding-agent/core/settings/keybindings";
export type { BuildSystemPromptOptions } from "#coding-agent/core/skills/system-prompt";
export type { MCPServerInfo } from "#coding-agent/packages/mcp/runtime/types";
