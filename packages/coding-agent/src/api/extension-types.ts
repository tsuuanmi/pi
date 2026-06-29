import type { ThinkingLevel } from "@tsuuanmi/pi-agent-core";
import type { Model, TextContent } from "@tsuuanmi/pi-ai";
import type { AutocompleteItem, Component, KeyId } from "@tsuuanmi/pi-tui";
import type { TSchema } from "typebox";
import type { EventBus } from "../core/events/event-bus.ts";
import type { ExecOptions, ExecResult } from "../core/exec/exec.ts";
import type { CustomMessage } from "../core/messages/messages.ts";
import type { SourceInfo } from "../core/resources/source-info.ts";
import type { SessionManager } from "../core/session/session-manager.ts";
import type { SlashCommandInfo } from "../core/skills/slash-commands.ts";
import type { BuildSystemPromptOptions } from "../core/skills/system-prompt.ts";
import type { MCPServerInfo } from "../packages/mcp/runtime/types.ts";
import type { Theme } from "../theme/theme.ts";
import type {
	CompactOptions,
	ContextUsage,
	ExtensionCommandContext,
	ExtensionContext,
	ReplacedSessionContext,
} from "./context-types.ts";
import type {
	AfterProviderResponseEvent,
	AgentEndEvent,
	AgentStartEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	BeforeProviderRequestEvent,
	BeforeProviderRequestEventResult,
	ContextEvent,
	ContextEventResult,
	InputEvent,
	InputEventResult,
	MessageEndEvent,
	MessageEndEventResult,
	MessageStartEvent,
	MessageUpdateEvent,
	ModelSelectEvent,
	ProjectTrustHandler,
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
	SessionShutdownEvent,
	SessionStartEvent,
	SessionTreeEvent,
	ThinkingLevelSelectEvent,
	ToolCallEvent,
	ToolCallEventResult,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolResultEvent,
	ToolResultEventResult,
	TurnEndEvent,
	TurnStartEvent,
	UserBashEvent,
	UserBashEventResult,
} from "./event-types.ts";
import type { ProviderConfig } from "./provider-types.ts";
import type { ToolDefinition } from "./tool-types.ts";

// ============================================================================
// Message Rendering
// ============================================================================

export interface MessageRenderOptions {
	expanded: boolean;
}

export type MessageRenderer<T = unknown> = (
	message: CustomMessage<T>,
	options: MessageRenderOptions,
	theme: Theme,
) => Component | undefined;

// ============================================================================
// Command Registration
// ============================================================================

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

// ============================================================================
// Extension API
// ============================================================================

/** Handler function type for events */
// biome-ignore lint/suspicious/noConfusingVoidType: void allows bare return statements
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;

/**
 * ExtensionAPI passed to extension factory functions.
 */
export interface ExtensionAPI {
	// =========================================================================
	// Event Subscription
	// =========================================================================

	on(event: "project_trust", handler: ProjectTrustHandler): void;
	on(event: "resources_discover", handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void;
	on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
	on(
		event: "session_before_switch",
		handler: ExtensionHandler<SessionBeforeSwitchEvent, SessionBeforeSwitchResult>,
	): void;
	on(event: "session_before_fork", handler: ExtensionHandler<SessionBeforeForkEvent, SessionBeforeForkResult>): void;
	on(
		event: "session_before_compact",
		handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>,
	): void;
	on(event: "session_compact", handler: ExtensionHandler<SessionCompactEvent>): void;
	on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
	on(event: "session_before_tree", handler: ExtensionHandler<SessionBeforeTreeEvent, SessionBeforeTreeResult>): void;
	on(event: "session_tree", handler: ExtensionHandler<SessionTreeEvent>): void;
	on(event: "context", handler: ExtensionHandler<ContextEvent, ContextEventResult>): void;
	on(
		event: "before_provider_request",
		handler: ExtensionHandler<BeforeProviderRequestEvent, BeforeProviderRequestEventResult>,
	): void;
	on(event: "after_provider_response", handler: ExtensionHandler<AfterProviderResponseEvent>): void;
	on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
	on(event: "agent_start", handler: ExtensionHandler<AgentStartEvent>): void;
	on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
	on(event: "turn_start", handler: ExtensionHandler<TurnStartEvent>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
	on(event: "message_start", handler: ExtensionHandler<MessageStartEvent>): void;
	on(event: "message_update", handler: ExtensionHandler<MessageUpdateEvent>): void;
	on(event: "message_end", handler: ExtensionHandler<MessageEndEvent, MessageEndEventResult>): void;
	on(event: "tool_execution_start", handler: ExtensionHandler<ToolExecutionStartEvent>): void;
	on(event: "tool_execution_update", handler: ExtensionHandler<ToolExecutionUpdateEvent>): void;
	on(event: "tool_execution_end", handler: ExtensionHandler<ToolExecutionEndEvent>): void;
	on(event: "model_select", handler: ExtensionHandler<ModelSelectEvent>): void;
	on(event: "thinking_level_select", handler: ExtensionHandler<ThinkingLevelSelectEvent>): void;
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	on(event: "tool_result", handler: ExtensionHandler<ToolResultEvent, ToolResultEventResult>): void;
	on(event: "user_bash", handler: ExtensionHandler<UserBashEvent, UserBashEventResult>): void;
	on(event: "input", handler: ExtensionHandler<InputEvent, InputEventResult>): void;

	// =========================================================================
	// Tool Registration
	// =========================================================================

	/** Register a tool that the LLM can call. */
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(
		tool: ToolDefinition<TParams, TDetails, TState>,
	): void;

	/** Unregister a previously registered tool by name. */
	unregisterTool(name: string): void;

	/** Refresh the host tool registry after dynamic tool changes. */
	refreshTools(options?: { includeAllExtensionTools?: boolean }): void;

	/** Register a provider for runtime MCP server status used by host UI/context APIs. */
	registerMcpServerInfoProvider(provider: () => MCPServerInfo[]): () => void;

	// =========================================================================
	// Command, Shortcut, Flag Registration
	// =========================================================================

	/** Register a custom command. */
	registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;

	/** Register a keyboard shortcut. */
	registerShortcut(
		shortcut: KeyId,
		options: {
			description?: string;
			handler: (ctx: ExtensionContext) => Promise<void> | void;
		},
	): void;

	/** Register a CLI flag. */
	registerFlag(
		name: string,
		options: {
			description?: string;
			type: "boolean" | "string";
			default?: boolean | string;
		},
	): void;

	/** Get the value of a registered CLI flag. */
	getFlag(name: string): boolean | string | undefined;

	// =========================================================================
	// Message Rendering
	// =========================================================================

	/** Register a custom renderer for CustomMessageEntry. */
	registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;

	// =========================================================================
	// Actions
	// =========================================================================

	/** Send a custom message to the session. */
	sendMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;

	/**
	 * Send a user message to the agent. Always triggers a turn.
	 * When the agent is streaming, use deliverAs to specify how to queue the message.
	 */
	sendUserMessage(content: string | TextContent[], options?: { deliverAs?: "steer" | "followUp" }): void;

	/** Append a custom entry to the session for state persistence (not sent to LLM). */
	appendEntry<T = unknown>(customType: string, data?: T): void;

	// =========================================================================
	// Session Metadata
	// =========================================================================

	/** Set the session display name (shown in session selector). */
	setSessionName(name: string): void;

	/** Get the current session name, if set. */
	getSessionName(): string | undefined;

	/** Set or clear a label on an entry. Labels are user-defined markers for bookmarking/navigation. */
	setLabel(entryId: string, label: string | undefined): void;

	/** Execute a shell command. */
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

	/** Get the list of currently active tool names. */
	getActiveTools(): string[];

	/** Get all configured tools with parameter schema, prompt guidelines, and source metadata. */
	getAllTools(): ToolInfo[];

	/** Set the active tools by name. */
	setActiveTools(toolNames: string[]): void;

	/** Get available slash commands in the current session. */
	getCommands(): SlashCommandInfo[];

	// =========================================================================
	// Model and Thinking Level
	// =========================================================================

	/** Set the current model. Returns false if no API key available. */
	setModel(model: Model<any>): Promise<boolean>;

	/** Get current thinking level. */
	getThinkingLevel(): ThinkingLevel;

	/** Set thinking level (clamped to model capabilities). */
	setThinkingLevel(level: ThinkingLevel): void;

	// =========================================================================
	// Provider Registration
	// =========================================================================

	/**
	 * Register or override a model provider.
	 *
	 * If `models` is provided: replaces all existing models for this provider.
	 * If only `baseUrl` is provided: overrides the URL for existing models.
	 * If `oauth` is provided: registers OAuth provider for /account add support.
	 * If `streamSimple` is provided: registers a custom API stream handler.
	 *
	 * During initial extension load this call is queued and applied once the
	 * runner has bound its context. After that it takes effect immediately, so
	 * it is safe to call from command handlers or event callbacks without
	 * requiring a `/reload`.
	 *
	 * @example
	 * // Register a new provider with custom models
	 * pi.registerProvider("my-proxy", {
	 *   baseUrl: "https://proxy.example.com",
	 *   apiKey: "$PROXY_API_KEY",
	 *   api: "anthropic-messages",
	 *   models: [
	 *     {
	 *       id: "claude-sonnet-4-20250514",
	 *       name: "Claude 4 Sonnet (proxy)",
	 *       reasoning: false,
	 *       input: ["text"],
	 *       cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	 *       contextWindow: 200000,
	 *       maxTokens: 16384
	 *     }
	 *   ]
	 * });
	 *
	 * @example
	 * // Override baseUrl for an existing provider
	 * pi.registerProvider("anthropic", {
	 *   baseUrl: "https://proxy.example.com"
	 * });
	 *
	 * @example
	 * // Register provider with OAuth support
	 * pi.registerProvider("corporate-ai", {
	 *   baseUrl: "https://ai.corp.com",
	 *   api: "openai-responses",
	 *   models: [...],
	 *   oauth: {
	 *     name: "Corporate AI (SSO)",
	 *     async login(callbacks) { ... },
	 *     async refreshToken(credentials) { ... },
	 *     getApiKey(credentials) { return credentials.access; }
	 *   }
	 * });
	 */
	registerProvider(name: string, config: ProviderConfig): void;

	/**
	 * Unregister a previously registered provider.
	 *
	 * Removes all models belonging to the named provider and restores any
	 * built-in models that were overridden by it. Has no effect if the provider
	 * is not currently registered.
	 *
	 * Like `registerProvider`, this takes effect immediately when called after
	 * the initial load phase.
	 *
	 * @example
	 * pi.unregisterProvider("my-proxy");
	 */
	unregisterProvider(name: string): void;

	/** Shared event bus for extension communication. */
	events: EventBus;
}

/** Extension factory function type. Supports both sync and async initialization. */
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

// ============================================================================
// Loaded Extension Types
// ============================================================================

export interface RegisteredTool {
	definition: ToolDefinition;
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

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

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

/** Tool info with name, description, parameter schema, prompt guidelines, and source metadata. */
export type ToolInfo = Pick<ToolDefinition, "name" | "description" | "parameters" | "promptGuidelines"> & {
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

/**
 * Shared state created by loader, used during registration and runtime.
 * Contains flag values (defaults set during registration, CLI values set after).
 */
export interface ExtensionRuntimeState {
	flagValues: Map<string, boolean | string>;
	/** Provider registrations queued during extension loading, processed when runner binds */
	pendingProviderRegistrations: Array<{ name: string; config: ProviderConfig; extensionPath: string }>;
	mcpServerInfoProviders: Set<() => MCPServerInfo[]>;
	/** Throws when this extension instance is stale after runtime replacement. */
	assertActive: () => void;
	/** Marks this extension instance as stale after runtime replacement or reload. */
	invalidate: (message?: string) => void;
	/**
	 * Register or unregister a provider.
	 *
	 * Before bindCore(): queues registrations / removes from queue.
	 * After bindCore(): calls ModelRegistry directly for immediate effect.
	 */
	registerProvider: (name: string, config: ProviderConfig, extensionPath?: string) => void;
	unregisterProvider: (name: string, extensionPath?: string) => void;
}

/**
 * Action implementations for pi.* API methods.
 * Provided to runner.initialize(), copied into the shared runtime.
 */
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

/**
 * Actions for ExtensionContext (ctx.* in event handlers).
 * Required by all modes.
 */
export interface ExtensionContextActions {
	getModel: () => Model<any> | undefined;
	isIdle: () => boolean;
	isProjectTrusted: () => boolean;
	getSignal: () => AbortSignal | undefined;
	abort: () => void;
	hasPendingMessages: () => boolean;
	shutdown: () => void;
	getContextUsage: () => ContextUsage | undefined;
	getMcpServerInfos: () => MCPServerInfo[];
	compact: (options?: CompactOptions) => void;
	getSystemPrompt: () => string;
	getSystemPromptOptions?: () => BuildSystemPromptOptions;
}

/**
 * Actions for ExtensionCommandContext (ctx.* in command handlers).
 * Only needed for interactive mode where extension commands are invokable.
 */
export interface ExtensionCommandContextActions {
	waitForIdle: () => Promise<void>;
	newSession: (options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}) => Promise<{ cancelled: boolean }>;
	fork: (
		entryId: string,
		options?: { position?: "before" | "at"; withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	) => Promise<{ cancelled: boolean }>;
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

/**
 * Full runtime = state + actions.
 * Created by loader with throwing action stubs, completed by runner.initialize().
 */
export interface ExtensionRuntime extends ExtensionRuntimeState, ExtensionActions {}

/** Loaded extension with all registered items. */
export interface Extension {
	path: string;
	resolvedPath: string;
	sourceInfo: SourceInfo;
	handlers: Map<string, HandlerFn[]>;
	tools: Map<string, RegisteredTool>;
	messageRenderers: Map<string, MessageRenderer>;
	commands: Map<string, RegisteredCommand>;
	flags: Map<string, ExtensionFlag>;
	shortcuts: Map<KeyId, ExtensionShortcut>;
}

/** Result of loading extensions. */
export interface LoadExtensionsResult {
	extensions: Extension[];
	errors: Array<{ path: string; error: string }>;
	/** Shared runtime - actions are throwing stubs until runner.initialize() */
	runtime: ExtensionRuntime;
}

// ============================================================================
// Extension Error
// ============================================================================

export interface ExtensionError {
	extensionPath: string;
	event: string;
	error: string;
	stack?: string;
}
