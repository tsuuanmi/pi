import type { CustomMessage, Model, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { TextContent } from "@tsuuanmi/pi-ai";
import type { AutocompleteItem, Component, KeyId, Theme } from "@tsuuanmi/pi-tui";
import type { TSchema } from "typebox";
import type {
	CompactOptions,
	ContextUsage,
	ExtensionCommandContext,
	ExtensionContext,
	ReplacedSessionContext,
} from "#pi/api/context-types";
import type { ProviderConfig } from "#pi/api/provider-types";
import type { ExtensionHudProvider } from "#pi/api/ui-types";
import type { ProgramOptions, ProgramResult } from "#pi/execution/program";
import type { ExtensionHookAPI } from "#pi/hooks/api";
import type { EventBus } from "#pi/hooks/event-bus";
import type { HookHandlerFn } from "#pi/hooks/register";
import type { BuildSystemPromptOptions } from "#pi/loader/agents/system-prompt";
import type { SourceInfo } from "#pi/resources/source-info";
import type { SessionManager } from "#pi/session/manager";
import type { ExtensionToolSpec } from "#pi/tool/spec";

export interface MessageRenderOptions {
	expanded: boolean;
}

export type MessageRenderer<T = unknown> = (
	message: CustomMessage<T>,
	options: MessageRenderOptions,
	theme: Theme,
) => Component | undefined;

export interface RegisteredCommand {
	name: string;
	sourceInfo: SourceInfo;
	description?: string;
	getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null | Promise<AutocompleteItem[] | null>;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

export interface ResolvedCommand extends RegisteredCommand {
	invocationName: string;
}

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface ExtensionAPI extends ExtensionHookAPI {
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(
		tool: ExtensionToolSpec<TParams, TDetails, TState>,
	): void;
	unregisterTool(name: string): void;
	refreshTools(options?: { includeAllExtensionTools?: boolean }): void;
	registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;
	registerHudProvider(provider: ExtensionHudProvider): void;
	registerShortcut(
		shortcut: KeyId,
		options: {
			description?: string;
			handler: (ctx: ExtensionContext) => Promise<void> | void;
		},
	): void;
	registerFlag(
		name: string,
		options: {
			description?: string;
			type: "boolean" | "string";
			default?: boolean | string;
		},
	): void;
	getFlag(name: string): boolean | string | undefined;
	registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;
	sendMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;
	sendUserMessage(content: string | TextContent[], options?: { deliverAs?: "steer" | "followUp" }): void;
	appendEntry<T = unknown>(customType: string, data?: T): void;
	setSessionName(name: string): void;
	getSessionName(): string | undefined;
	setLabel(entryId: string, label: string | undefined): void;
	exec(command: string, args: string[], options?: ProgramOptions): Promise<ProgramResult>;
	getActiveTools(): string[];
	getAllTools(): ToolInfo[];
	setActiveTools(toolNames: string[]): void;
	getCommands(): SlashCommandInfo[];
	setModel(model: Model<any>): Promise<boolean>;
	getThinkingLevel(): ThinkingLevel;
	setThinkingLevel(level: ThinkingLevel): void;
	registerProvider(name: string, config: ProviderConfig): void;
	unregisterProvider(name: string): void;
	events: EventBus;
}

export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

export interface RegisteredTool {
	definition: ExtensionToolSpec;
	sourceInfo: SourceInfo;
}

export interface ExtensionFlag {
	name: string;
	description?: string;
	type: "boolean" | "string";
	default?: boolean | string;
	extensionPath: string;
}

export interface ExtensionShortcut {
	shortcut: KeyId;
	description?: string;
	handler: (ctx: ExtensionContext) => Promise<void> | void;
	extensionPath: string;
}

export type SendMessageHandler = <T = unknown>(
	message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
	options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
) => void;

export type SendUserMessageHandler = (
	content: string | TextContent[],
	options?: { deliverAs?: "steer" | "followUp" },
) => void;

export type AppendEntryHandler = <T = unknown>(customType: string, data?: T) => void;
export type SetSessionNameHandler = (name: string) => void;
export type GetSessionNameHandler = () => string | undefined;
export type GetActiveToolsHandler = () => string[];
export type ToolInfo = Pick<ExtensionToolSpec, "name" | "description" | "parameters" | "promptGuidelines"> & {
	sourceInfo: SourceInfo;
};
export type GetAllToolsHandler = () => ToolInfo[];
export type GetCommandsHandler = () => SlashCommandInfo[];
export type SetActiveToolsHandler = (toolNames: string[]) => void;
export type RefreshToolsHandler = (options?: { includeAllExtensionTools?: boolean }) => void;
export type SetModelHandler = (model: Model<any>) => Promise<boolean>;
export type GetThinkingLevelHandler = () => ThinkingLevel;
export type SetThinkingLevelHandler = (level: ThinkingLevel) => void;
export type SetLabelHandler = (entryId: string, label: string | undefined) => void;

export interface ExtensionRuntimeState {
	flagValues: Map<string, boolean | string>;
	pendingProviderRegistrations: Array<{ name: string; config: ProviderConfig; extensionPath: string }>;
	assertActive: () => void;
	invalidate: (message?: string) => void;
	registerProvider: (name: string, config: ProviderConfig, extensionPath?: string) => void;
	unregisterProvider: (name: string, extensionPath?: string) => void;
}

export interface ExtensionActions {
	sendMessage: SendMessageHandler;
	sendUserMessage: SendUserMessageHandler;
	appendEntry: AppendEntryHandler;
	setSessionName: SetSessionNameHandler;
	getSessionName: GetSessionNameHandler;
	setLabel: SetLabelHandler;
	getActiveTools: GetActiveToolsHandler;
	getAllTools: GetAllToolsHandler;
	setActiveTools: SetActiveToolsHandler;
	refreshTools: RefreshToolsHandler;
	getCommands: GetCommandsHandler;
	setModel: SetModelHandler;
	getThinkingLevel: GetThinkingLevelHandler;
	setThinkingLevel: SetThinkingLevelHandler;
}

export interface ExtensionContextActions {
	getModel: () => Model<any> | undefined;
	isIdle: () => boolean;
	getSignal: () => AbortSignal | undefined;
	abort: () => void;
	hasPendingMessages: () => boolean;
	shutdown: () => void;
	getContextUsage: () => ContextUsage | undefined;
	compact: (options?: CompactOptions) => void;
	getSystemPrompt: () => string;
	getSystemPromptOptions?: () => BuildSystemPromptOptions;
}

export interface ExtensionCommandContextActions {
	waitForIdle: () => Promise<void>;
	newSession: (options?: {
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}) => Promise<{ cancelled: boolean }>;
	navigateTree: (
		targetId: string,
		options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	) => Promise<{ cancelled: boolean }>;
	switchSession: (
		sessionPath: string,
		options?: { withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	) => Promise<{ cancelled: boolean }>;
	reload: () => Promise<void>;
}

export interface ExtensionRuntime extends ExtensionRuntimeState, ExtensionActions {}

export interface Extension {
	path: string;
	resolvedPath: string;
	sourceInfo: SourceInfo;
	handlers: Map<string, HookHandlerFn[]>;
	tools: Map<string, RegisteredTool>;
	messageRenderers: Map<string, MessageRenderer>;
	commands: Map<string, RegisteredCommand>;
	flags: Map<string, ExtensionFlag>;
	shortcuts: Map<KeyId, ExtensionShortcut>;
	hudProviders: ExtensionHudProvider[];
}

export interface LoadExtensionsResult {
	extensions: Extension[];
	errors: Array<{ path: string; error: string }>;
	runtime: ExtensionRuntime;
}

export interface ExtensionError {
	extensionPath: string;
	event: string;
	error: string;
	stack?: string;
}
