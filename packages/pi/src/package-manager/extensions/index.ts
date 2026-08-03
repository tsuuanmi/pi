/**
 * Extension subsystem exports.
 */

export type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ToolExecutionMode,
} from "@tsuuanmi/pi-agent";
export type { BuildSystemPromptOptions } from "#pi/agent/system-prompt";
export type {
	CompactOptions,
	ContextUsage,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionMode,
	ReplacedSessionContext,
} from "#pi/api/context-types";
export type {
	AppendEntryHandler,
	Extension,
	ExtensionActions,
	ExtensionAPI,
	ExtensionCommandContextActions,
	ExtensionContextActions,
	ExtensionError,
	ExtensionFactory,
	ExtensionFlag,
	ExtensionRuntime,
	ExtensionShortcut,
	GetActiveToolsHandler,
	GetAllToolsHandler,
	GetCommandsHandler,
	GetThinkingLevelHandler,
	LoadExtensionsResult,
	MessageRenderer,
	MessageRenderOptions,
	RegisteredCommand,
	RegisteredTool,
	ResolvedCommand,
	SendMessageHandler,
	SendUserMessageHandler,
	SetActiveToolsHandler,
	SetLabelHandler,
	SetModelHandler,
	SetThinkingLevelHandler,
	ToolInfo,
} from "#pi/api/extension-types";
export type { ProviderConfig, ProviderModelConfig } from "#pi/api/provider-types";
export type { ToolDefinition, ToolRenderResultOptions } from "#pi/api/tool-types";
export { defineTool } from "#pi/api/tool-types";
export type {
	AutocompleteProviderFactory,
	EditorFactory,
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	TerminalInputHandler,
	WidgetPlacement,
	WorkingIndicatorOptions,
} from "#pi/api/ui-types";
export type { ExecOptions, ExecResult } from "#pi/execution/command-executor";
export type {
	AfterProviderResponseEvent,
	AgentEndEvent,
	AgentStartEvent,
	BashToolCallEvent,
	BashToolResultEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	ContextEvent,
	ContextEventResult,
	CustomToolCallEvent,
	CustomToolResultEvent,
	EditToolCallEvent,
	EditToolResultEvent,
	ExtensionEvent,
	FindToolCallEvent,
	FindToolResultEvent,
	GrepToolCallEvent,
	GrepToolResultEvent,
	InputEvent,
	InputEventResult,
	InputSource,
	LsToolCallEvent,
	LsToolResultEvent,
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	ModelSelectEvent,
	ModelSelectSource,
	ReadToolCallEvent,
	ReadToolResultEvent,
	ResourcesDiscoverEvent,
	ResourcesDiscoverResult,
	SessionBeforeCompactEvent,
	SessionBeforeCompactResult,
	SessionBeforeForkEvent,
	SessionBeforeForkResult,
	SessionBeforeSwitchEvent,
	SessionBeforeSwitchResult,
	SessionBeforeTreeEvent,
	SessionBeforeTreeResult,
	SessionCompactEvent,
	SessionEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	SessionTreeEvent,
	ToolCallEvent,
	ToolCallEventResult,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolResultEvent,
	ToolResultEventResult,
	TreePreparation,
	TurnEndEvent,
	TurnStartEvent,
	UserBashEvent,
	UserBashEventResult,
	WriteToolCallEvent,
	WriteToolResultEvent,
} from "#pi/package-manager/extensions/hooks/event-types";
export {
	isBashToolResult,
	isEditToolResult,
	isFindToolResult,
	isGrepToolResult,
	isLsToolResult,
	isReadToolResult,
	isToolCallEventType,
	isWriteToolResult,
} from "#pi/package-manager/extensions/hooks/event-types";
export type { ExtensionHandler, ExtensionHookAPI } from "#pi/package-manager/extensions/hooks/extension-api-hooks";
export type {
	ExtensionErrorListener,
	ForkHandler,
	NavigateTreeHandler,
	NewSessionHandler,
	ShutdownHandler,
	SwitchSessionHandler,
} from "#pi/package-manager/extensions/runner";
export { ExtensionRunner } from "#pi/package-manager/extensions/runner";
export { wrapRegisteredTool, wrapRegisteredTools } from "#pi/package-manager/extensions/wrapper";
export type { SourceInfo } from "#pi/package-manager/source-info";
export type { AppKeybinding, KeybindingsManager } from "#pi/settings/keybindings";
export type { SlashCommandInfo, SlashCommandSource } from "#pi/skills/slash-commands";
