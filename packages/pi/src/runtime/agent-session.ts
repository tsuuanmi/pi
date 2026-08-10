/**
 * Pi session runtime shared by interactive, print, and RPC modes.
 *
 * The exported AgentSession class is the public session API; this module owns
 * Pi-specific orchestration around the core agent, persisted session history,
 * extensions, tools, model controls, compaction, and shell execution.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type {
	Agent,
	AgentEvent,
	AgentMessage,
	AgentState,
	CustomMessage,
	StructuredOutputOptions,
	StructuredOutputResult,
	SubagentManager,
	Tool,
} from "@tsuuanmi/pi-agent";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import type { AssistantMessage, Model, TextContent, ThinkingLevel } from "@tsuuanmi/pi-ai";
import { cleanupSessionResources, resetProviders, stream } from "@tsuuanmi/pi-ai";
import type { Static, TSchema } from "typebox";
import { ApiUsageLogger } from "#pi/api/api-usage-logger";
import { apiUsageLogPath } from "#pi/api/api-usage-utils";
import type { SlashCommandInfo } from "#pi/api/extension-types";
import { formatNoApiKeyFoundMessage } from "#pi/auth/guidance";
import type { BashOperations } from "#pi/execution/backend";
import type { BashResult } from "#pi/execution/bash";
import { installToolHooks } from "#pi/hooks/agent-bridge";
import { type BuildSystemPromptOptions, buildSystemPrompt } from "#pi/loader/agents/system-prompt";
import type {
	ContextUsage,
	ExtensionCommandContextActions,
	ExtensionMode,
	ExtensionUIContext,
	MessageEndEvent,
	MessageStartEvent,
	MessageUpdateEvent,
	ReplacedSessionContext,
	SessionStartEvent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
	ToolInfo,
	TurnEndEvent,
	TurnStartEvent,
} from "#pi/loader/extensions/index";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { PromptTemplate } from "#pi/loader/prompt-templates";
import type { ResourceExtensionPaths, ResourceLoader } from "#pi/loader/resources";
import type { AgentSessionContext } from "#pi/runtime/agent-session-context";
import {
	type ExtensionErrorListener,
	ExtensionRunner,
	emitSessionShutdownEvent,
	type ShutdownHandler,
} from "#pi/runtime/extensions/runner";
import {
	cycleModel as modelControlCycleModel,
	cycleThinkingLevel as modelControlCycleThinkingLevel,
	getAvailableThinkingLevels as modelControlGetAvailableThinkingLevels,
	setModel as modelControlSetModel,
	setThinkingLevel as modelControlSetThinkingLevel,
	supportsThinking as modelControlSupportsThinking,
} from "#pi/runtime/model-control";
import { BashController } from "#pi/runtime/session/bash";
import { CompactionController } from "#pi/runtime/session/compaction";
import { PromptController } from "#pi/runtime/session/prompt";
import { RetryController } from "#pi/runtime/session/retry";
import type {
	AgentSessionConfig,
	AgentSessionEvent,
	AgentSessionEventListener,
	ExtensionBindings,
	ModelCycleResult,
	PromptOptions,
	SessionStats,
} from "#pi/runtime/session/types";
import { expandSkillCommand } from "#pi/runtime/skill-expansion";
import { computeContextUsage, computeSessionStats } from "#pi/runtime/stats-export";
import { ToolManager } from "#pi/runtime/tool-manager";
import { navigateTree as treeNavNavigateTree } from "#pi/runtime/tree-navigation";
import type { CompactionResult } from "#pi/session/compaction/index";
import type { SessionManager } from "#pi/session/manager";
import { type BranchSummaryEntry, SESSION_VERSION, type SessionHeader } from "#pi/session/types";
import type { SettingsManager } from "#pi/settings/manager";
import type { ExtensionToolSpec, PiToolSpec } from "#pi/tool/spec";
import { createToolSpecs } from "#pi/tools/index";

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// AgentSession Class
// ============================================================================

export class AgentSession {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;

	private _scopedModels: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;

	// Event subscription state
	private _unsubscribeAgent?: () => void;
	private _eventListeners: AgentSessionEventListener[] = [];

	private _compaction: CompactionController;
	private _prompt: PromptController;

	// Branch summarization state
	private _branchSummaryAbortController: AbortController | undefined = undefined;

	private _retry: RetryController;

	private _bash: BashController;

	// Extension system
	private _extensionRunner!: ExtensionRunner;
	private _agentToolHookDisposer?: () => void;
	private _turnIndex = 0;

	private _resourceLoader: ResourceLoader;
	private _toolManager: ToolManager;
	private _baseTools: Map<string, PiToolSpec | Tool> = new Map();
	private _cwd: string;
	private _extensionRunnerRef?: { current?: ExtensionRunner };
	private _initialActiveToolNames?: string[];
	private _baseToolsOverride?: Record<string, Tool>;
	private _sessionStartEvent: SessionStartEvent;
	private _skipWorkflowContinuation: boolean;
	private _extraSystemPrompt?: string;
	private _apiUsageSessionId?: string;
	private _subagentManager?: SubagentManager;
	private _apiUsageLogger?: ApiUsageLogger;
	private _extensionUIContext?: ExtensionUIContext;
	private _extensionMode: ExtensionMode = "print";
	private _extensionCommandContextActions?: ExtensionCommandContextActions;
	private _extensionAbortHandler?: () => void;
	private _extensionShutdownHandler?: ShutdownHandler;
	private _extensionErrorListener?: ExtensionErrorListener;
	private _extensionErrorUnsubscriber?: () => void;

	// Model registry for API key resolution
	private _modelRegistry: ModelRegistry;
	private readonly _webProviderRegistry?: AgentSessionConfig["webProviderRegistry"];

	// Base system prompt (without extension appends) - used to apply fresh appends each turn
	private _baseSystemPrompt = "";
	private _baseSystemPromptOptions!: BuildSystemPromptOptions;

	constructor(config: AgentSessionConfig) {
		this.agent = config.agent;
		this.sessionManager = config.sessionManager;
		this.settingsManager = config.settingsManager;
		this._modelRegistry = config.modelRegistry;
		this._webProviderRegistry = config.webProviderRegistry;
		this._bash = new BashController({
			agent: this.agent,
			sessionManager: this.sessionManager,
			settingsManager: this.settingsManager,
			isStreaming: () => this.isStreaming,
		});
		this._retry = new RetryController({
			agent: this.agent,
			settingsManager: this.settingsManager,
			getModel: () => this.model,
			emit: (event) => this._emit(event),
		});
		const session = this;
		this._compaction = new CompactionController({
			agent: this.agent,
			sessionManager: this.sessionManager,
			settingsManager: this.settingsManager,
			modelRegistry: this._modelRegistry,
			get extensionRunner() {
				return session._extensionRunner;
			},
			get model() {
				return session.model;
			},
			get thinkingLevel() {
				return session.thinkingLevel;
			},
			getCompactionRequestAuth: (model) => this._getCompactionRequestAuth(model),
			disconnect: () => this._disconnectFromAgent(),
			reconnect: () => this._reconnectToAgent(),
			abort: () => this.abort(),
			emit: (event) => this._emit(event),
		});
		this._scopedModels = config.scopedModels ?? [];
		this._resourceLoader = config.resourceLoader;
		this._cwd = config.cwd;
		this._extensionRunnerRef = config.extensionRunnerRef;
		this._initialActiveToolNames = config.initialActiveToolNames;
		this._baseToolsOverride = config.baseToolsOverride;
		this._toolManager = new ToolManager({
			customTools: config.customTools ?? [],
			allowedNames: config.allowedToolNames,
			excludedNames: config.excludedToolNames,
			apply: (names, tools) => this._applyActiveTools(names, tools),
		});
		this._sessionStartEvent = config.sessionStartEvent ?? { type: "session_start", reason: "startup" };
		this._skipWorkflowContinuation = config.skipWorkflowContinuation ?? false;
		this._extraSystemPrompt = config.extraSystemPrompt;
		this._apiUsageSessionId = config.apiUsageSessionId;
		this._subagentManager = config.subagentManager ?? undefined;
		this._prompt = new PromptController({
			agent: this.agent,
			sessionManager: this.sessionManager,
			modelRegistry: this._modelRegistry,
			get extensionRunner() {
				return session._extensionRunner;
			},
			get model() {
				return session.model;
			},
			get isStreaming() {
				return session.isStreaming;
			},
			get promptTemplates() {
				return session.promptTemplates;
			},
			get baseSystemPrompt() {
				return session._baseSystemPrompt;
			},
			get baseSystemPromptOptions() {
				return session._baseSystemPromptOptions;
			},
			expandSkillCommand: (text) => expandSkillCommand(text, this._ctx()),
			findLastAgentMessage: () => this._findLastAgentMessage(),
			runAgentPrompt: (messages) => this._runAgentPrompt(messages),
			handlePostAgentRun: () => this._handlePostAgentRun(),
			checkCompaction: (message, skipAbortedCheck) => this._compaction.check(message, skipAbortedCheck),
			flushBash: () => this._bash.flush(),
			emit: (event) => this._emit(event),
		});
		this._installApiUsageLogger();

		// Always subscribe to agent events for internal handling
		// (session persistence, extensions, auto-compaction, retry logic)
		this._unsubscribeAgent = this.agent.subscribe(this._handleAgentEvent);

		this._buildRuntime({
			activeToolNames: this._initialActiveToolNames,
			includeAllExtensionTools: true,
		});
	}

	private _installApiUsageLogger(): void {
		if (!this.settingsManager.getApiUsageLoggingEnabled()) {
			this.agent.providerRequestObserver = undefined;
			return;
		}
		const sessionId = this._apiUsageSessionId ?? this.sessionManager.getSessionId();
		const path = apiUsageLogPath(this._cwd, sessionId);
		if (!path) {
			this.agent.providerRequestObserver = undefined;
			return;
		}
		this._apiUsageLogger = new ApiUsageLogger({
			cwd: this._cwd,
			sessionId,
			path,
			transport: this.settingsManager.getTransport(),
		});
		this.agent.providerRequestObserver = this._apiUsageLogger;
	}

	/** Model registry for API key resolution and model discovery */
	get modelRegistry(): ModelRegistry {
		return this._modelRegistry;
	}

	syncWebModels(): void {
		this._webProviderRegistry?.sync();
	}

	private async _getRequiredRequestAuth(model: Model<any>): Promise<{
		apiKey: string;
		headers?: Record<string, string>;
		env?: Record<string, string>;
	}> {
		const result = await this._modelRegistry.getApiKeyAndHeaders(model);
		if (!result.ok) {
			if (result.error.startsWith("No API key found")) {
				throw new Error(formatNoApiKeyFoundMessage(model.provider));
			}
			throw new Error(result.error);
		}
		if (result.apiKey) {
			return { apiKey: result.apiKey, headers: result.headers, env: result.env };
		}

		const isOAuth = this._modelRegistry.isUsingOAuth(model);
		if (isOAuth) {
			throw new Error(
				`Authentication failed for "${model.provider}". ` +
					`Credentials may have expired or network is unavailable. ` +
					`Run '/account add ${model.provider}' to re-authenticate.`,
			);
		}
		throw new Error(formatNoApiKeyFoundMessage(model.provider));
	}

	private async _getCompactionRequestAuth(model: Model<any>): Promise<{
		apiKey?: string;
		headers?: Record<string, string>;
		env?: Record<string, string>;
	}> {
		if (this.agent.stream === stream) {
			return this._getRequiredRequestAuth(model);
		}

		const result = await this._modelRegistry.getApiKeyAndHeaders(model);
		return result.ok ? { apiKey: result.apiKey, headers: result.headers, env: result.env } : {};
	}

	/** Install the current extension bridge on the Agent instance. */
	private _installToolHooks(): void {
		this._agentToolHookDisposer?.();
		this._agentToolHookDisposer = installToolHooks(this.agent, this._extensionRunner);
	}

	// =========================================================================
	// Event Subscription
	// =========================================================================

	/** Emit an event to all listeners */
	private _emit(event: AgentSessionEvent): void {
		for (const l of this._eventListeners) {
			l(event);
		}
	}

	// Track last assistant message for auto-compaction check
	private _lastAgentMessage: AssistantMessage | undefined = undefined;

	/** Internal handler for agent events - shared by subscribe and reconnect */
	private _handleAgentEvent = async (event: AgentEvent): Promise<void> => {
		// When a user message starts, check if it's from either queue and remove it BEFORE emitting
		// This ensures the UI sees the updated queue state
		if (event.type === "message_start" && event.message.role === "user") {
			this._compaction.resetOverflowRecovery();
			const messageText = this._getUserMessageText(event.message);
			if (messageText) {
				this._prompt.removeQueuedMessage(messageText);
			}
		}

		// Emit to extensions first
		await this._emitExtensionEvent(event);

		// Notify all listeners
		this._emit(event.type === "agent_end" ? { ...event, willRetry: this._retry.willRetryAfterEnd(event) } : event);

		// Handle session persistence
		if (event.type === "message_end") {
			// Check if this is a custom message from extensions
			if (event.message.role === "custom") {
				// Persist as CustomMessageEntry
				this.sessionManager.appendCustomMessageEntry(
					event.message.customType,
					event.message.content,
					event.message.display,
					event.message.details,
				);
			} else if (
				event.message.role === "user" ||
				event.message.role === "assistant" ||
				event.message.role === "toolResult"
			) {
				// Regular LLM message - persist as SessionMessageEntry
				this.sessionManager.appendMessage(event.message);
			}
			// Other message types (bashExecution, compactionSummary, branchSummary) are persisted elsewhere

			// Track assistant message for auto-compaction (checked on agent_end)
			if (event.message.role === "assistant") {
				this._lastAgentMessage = event.message;

				const agentMessage = event.message as AssistantMessage;
				if (agentMessage.stopReason !== "error") {
					this._compaction.resetOverflowRecovery();
				}

				// Reset retry counter immediately on successful assistant response
				// This prevents accumulation across multiple LLM calls within a turn
				this._retry.resetAfterSuccess(agentMessage);
			}
		}
	};

	/** Extract text content from a message */
	private _getUserMessageText(message: AgentMessage): string {
		if (message.role !== "user") return "";
		const content = message.content;
		if (typeof content === "string") return content;
		const textBlocks = content.filter((c) => c.type === "text");
		return textBlocks.map((c) => (c as TextContent).text).join("");
	}

	/** Find the last assistant message in agent state (including aborted ones) */
	private _findLastAgentMessage(): AssistantMessage | undefined {
		const messages = this.agent.state.messages;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "assistant") {
				return msg as AssistantMessage;
			}
		}
		return undefined;
	}

	private _replaceMessageInPlace(target: AgentMessage, replacement: AgentMessage): void {
		// Agent-core stores the finalized message object in its state before emitting message_end.
		// SessionManager persistence happens later in _handleAgentEvent() with event.message.
		// Mutating this object in place keeps agent state, later turn/agent events, listeners,
		// and the eventual SessionManager.appendMessage(event.message) persistence in sync.
		if (target === replacement) {
			return;
		}

		const targetRecord = target as unknown as Record<string, unknown>;
		for (const key of Object.keys(targetRecord)) {
			delete targetRecord[key];
		}
		Object.assign(targetRecord, replacement);
	}

	/** Emit extension events based on agent events */
	private async _emitExtensionEvent(event: AgentEvent): Promise<void> {
		if (event.type === "agent_start") {
			this._turnIndex = 0;
			await this._extensionRunner.emit({ type: "agent_start" });
		} else if (event.type === "agent_end") {
			await this._extensionRunner.emit({ type: "agent_end", messages: event.messages });
		} else if (event.type === "turn_start") {
			const extensionEvent: TurnStartEvent = {
				type: "turn_start",
				turnIndex: this._turnIndex,
				timestamp: Date.now(),
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "turn_end") {
			const extensionEvent: TurnEndEvent = {
				type: "turn_end",
				turnIndex: this._turnIndex,
				message: event.message,
				toolResults: event.toolResults,
			};
			await this._extensionRunner.emit(extensionEvent);
			this._turnIndex++;
		} else if (event.type === "message_start") {
			const extensionEvent: MessageStartEvent = {
				type: "message_start",
				message: event.message,
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "message_update") {
			const extensionEvent: MessageUpdateEvent = {
				type: "message_update",
				message: event.message,
				assistantMessageEvent: event.assistantMessageEvent,
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "message_end") {
			const extensionEvent: MessageEndEvent = {
				type: "message_end",
				message: event.message,
			};
			const replacement = await this._extensionRunner.emitMessageEnd(extensionEvent);
			if (replacement) {
				this._replaceMessageInPlace(event.message, replacement);
			}
		} else if (event.type === "tool_execution_start") {
			const extensionEvent: ToolExecutionStartEvent = {
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "tool_execution_update") {
			const extensionEvent: ToolExecutionUpdateEvent = {
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				partialResult: event.partialResult,
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "tool_execution_end") {
			const extensionEvent: ToolExecutionEndEvent = {
				type: "tool_execution_end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				result: event.result,
				isError: event.isError,
			};
			await this._extensionRunner.emit(extensionEvent);
		} else if (event.type === "loop_detected") {
			await this._extensionRunner.emit({ type: "loop_detected", result: event.result });
		} else if (event.type === "structured_output") {
			await this._extensionRunner.emit(event);
		}
	}

	/**
	 * Subscribe to agent events.
	 * Session persistence is handled internally (saves messages on message_end).
	 * Multiple listeners can be added. Returns unsubscribe function for this listener.
	 */
	subscribe(listener: AgentSessionEventListener): () => void {
		this._eventListeners.push(listener);

		// Return unsubscribe function for this specific listener
		return () => {
			const index = this._eventListeners.indexOf(listener);
			if (index !== -1) {
				this._eventListeners.splice(index, 1);
			}
		};
	}

	/**
	 * Temporarily disconnect from agent events.
	 * User listeners are preserved and will receive events again after resubscribe().
	 * Used internally during operations that need to pause event processing.
	 */
	private _disconnectFromAgent(): void {
		if (this._unsubscribeAgent) {
			this._unsubscribeAgent();
			this._unsubscribeAgent = undefined;
		}
	}

	/**
	 * Reconnect to agent events after _disconnectFromAgent().
	 * Preserves all existing listeners.
	 */
	private _reconnectToAgent(): void {
		if (this._unsubscribeAgent) return; // Already connected
		this._unsubscribeAgent = this.agent.subscribe(this._handleAgentEvent);
	}

	/**
	 * Remove all listeners and disconnect from agent.
	 * Call this when completely done with the session.
	 */
	dispose(): void {
		try {
			this.abortRetry();
			this.abortCompaction();
			this.abortBranchSummary();
			this.abortBash();
			this.agent.abort();
		} catch {
			// Dispose must succeed even if an abort hook throws.
		}

		this._extensionRunner.invalidate(
			"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.switchSession(), or ctx.reload(). For newSession and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().",
		);
		this._disconnectFromAgent();
		this._eventListeners = [];
		cleanupSessionResources(this.sessionId);
	}

	// =========================================================================
	// Read-only State Access
	// =========================================================================

	/** Full agent state */
	get state(): AgentState {
		return this.agent.state;
	}

	/** Current model (may be undefined if not yet selected) */
	get model(): Model<any> | undefined {
		return this.agent.state.model;
	}

	/** Current thinking level */
	get thinkingLevel(): ThinkingLevel {
		return this.agent.state.thinkingLevel;
	}

	/** Whether agent is currently streaming a response */
	get isStreaming(): boolean {
		return this.agent.state.isStreaming;
	}

	/** Current effective system prompt (includes any per-turn extension modifications) */
	get systemPrompt(): string {
		return this.agent.state.systemPrompt;
	}

	/** Current retry attempt (0 if not retrying) */
	get retryAttempt(): number {
		return this._retry.retryAttempt;
	}

	/**
	 * Get the names of currently active tools.
	 * Returns the names of tools currently set on the agent.
	 */
	getActiveToolNames(): string[] {
		return this.agent.getTools().map((t) => t.name);
	}

	/**
	 * Get all configured tools with name, description, parameter schema, prompt guidelines, and source metadata.
	 */
	getAllTools(): ToolInfo[] {
		return this._toolManager.getAll();
	}

	getToolSpec(name: string): PiToolSpec | ExtensionToolSpec | undefined {
		return this._toolManager.get(name);
	}

	/**
	 * Set active tools by name.
	 * Only tools in the registry can be enabled. Unknown tool names are ignored.
	 * Also rebuilds the system prompt to reflect the new tool set.
	 * Changes take effect on the next agent turn.
	 */
	setActiveToolsByName(toolNames: string[]): void {
		this._toolManager.setActiveNames(toolNames);
	}

	/** Whether compaction or branch summarization is currently running */
	get isCompacting(): boolean {
		return this._compaction.isRunning || this._branchSummaryAbortController !== undefined;
	}

	/** All messages including custom types like BashExecutionMessage */
	get messages(): AgentMessage[] {
		return this.agent.state.messages;
	}

	/** Current steering mode */
	get steeringMode(): "all" | "one-at-a-time" {
		return this.agent.steeringMode;
	}

	/** Current follow-up mode */
	get followUpMode(): "all" | "one-at-a-time" {
		return this.agent.followUpMode;
	}

	/** Current session file path, or undefined if sessions are disabled */
	get sessionFile(): string | undefined {
		return this.sessionManager.getSessionFile();
	}

	/** Current session ID */
	get sessionId(): string {
		return this.sessionManager.getSessionId();
	}

	/** Current session display name, if set */
	get sessionName(): string | undefined {
		return this.sessionManager.getSessionName();
	}

	/** Scoped models for cycling */
	get scopedModels(): ReadonlyArray<{ model: Model<any>; thinkingLevel?: ThinkingLevel }> {
		return this._scopedModels;
	}

	/** Update scoped models for cycling */
	setScopedModels(scopedModels: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>): void {
		this._scopedModels = scopedModels;
	}

	/** File-based prompt templates */
	get promptTemplates(): ReadonlyArray<PromptTemplate> {
		return this._resourceLoader.getPrompts().prompts;
	}

	private _applyActiveTools(toolNames: string[], tools: Tool[]): void {
		this.agent.setTools(tools);
		this._baseSystemPrompt = this._rebuildSystemPrompt(toolNames);
		this.agent.state.systemPrompt = this._baseSystemPrompt;
	}

	private _rebuildSystemPrompt(toolNames: string[]): string {
		const validToolNames = toolNames.filter((name) => this._toolManager.has(name));
		const prompts = this._toolManager.getPrompts(validToolNames);
		const toolSnippets = prompts.snippets;
		const promptGuidelines = prompts.guidelines;

		const loaderSystemPrompt = this._resourceLoader.getSystemPrompt();
		const loaderAppendSystemPrompt = this._resourceLoader.getAppendSystemPrompt();
		const appendSystemPrompt =
			loaderAppendSystemPrompt.length > 0 ? loaderAppendSystemPrompt.join("\n\n") : undefined;
		const loadedSkills = this._resourceLoader.getSkills().skills;
		const loadedContextFiles = this._resourceLoader.getAgentsFiles().agentsFiles;

		this._baseSystemPromptOptions = {
			cwd: this._cwd,
			skills: loadedSkills,
			contextFiles: loadedContextFiles,
			customPrompt: loaderSystemPrompt,
			appendSystemPrompt,
			selectedTools: validToolNames,
			toolSnippets,
			promptGuidelines,
		};
		const prompt = buildSystemPrompt(this._baseSystemPromptOptions);
		return this._extraSystemPrompt ? `${prompt}\n\n${this._extraSystemPrompt}` : prompt;
	}

	// =========================================================================
	// Prompting
	// =========================================================================

	private async _runAgentPrompt(messages: AgentMessage | AgentMessage[]): Promise<void> {
		try {
			await this.agent.prompt(messages);
			while (await this._handlePostAgentRun()) {
				await this.agent.continue();
			}
		} finally {
			this._bash.flush();
		}
	}

	private async _handlePostAgentRun(): Promise<boolean> {
		const msg = this._lastAgentMessage;
		this._lastAgentMessage = undefined;
		if (!msg) {
			return false;
		}

		if (this._retry.isRetryable(msg) && (await this._retry.prepare(msg))) {
			return true;
		}

		this._retry.finish(msg);

		if (await this._compaction.check(msg)) {
			return true;
		}

		// The agent loop drains both queues before emitting agent_end. Any messages
		// here were queued by agent_end extension handlers and need a continuation.
		return this.agent.hasQueuedMessages();
	}

	// =========================================================================
	// Prompting
	// =========================================================================

	async promptStructured<TSchemaValue extends TSchema>(
		text: string,
		options: PromptOptions & StructuredOutputOptions<TSchemaValue>,
	): Promise<StructuredOutputResult<Static<TSchemaValue>>> {
		return this._prompt.promptStructured(text, options);
	}

	async prompt(text: string, options?: PromptOptions): Promise<void> {
		return this._prompt.prompt(text, options);
	}

	async steer(text: string): Promise<void> {
		return this._prompt.steer(text);
	}

	async followUp(text: string): Promise<void> {
		return this._prompt.followUp(text);
	}

	async sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> {
		return this._prompt.sendCustomMessage(message, options);
	}

	async sendUserMessage(
		content: string | TextContent[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void> {
		return this._prompt.sendUserMessage(content, options);
	}

	clearQueue(): { steering: string[]; followUp: string[] } {
		return this._prompt.clearQueue();
	}

	get pendingMessageCount(): number {
		return this._prompt.pendingMessageCount;
	}

	getSteeringMessages(): readonly string[] {
		return this._prompt.getSteeringMessages();
	}

	getFollowUpMessages(): readonly string[] {
		return this._prompt.getFollowUpMessages();
	}

	get resourceLoader(): ResourceLoader {
		return this._resourceLoader;
	}

	/**
	 * Abort current operation and wait for agent to become idle.
	 */
	async abort(): Promise<void> {
		this.abortRetry();
		this.agent.abort();
		await this.agent.waitForIdle();
	}

	// =========================================================================
	// Model Management
	// =========================================================================

	/**
	 * Set model directly.
	 * Validates that auth is configured, saves to session and settings.
	 * @throws Error if no auth is configured for the model
	 */
	async setModel(model: Model<any>): Promise<void> {
		return modelControlSetModel(model, this._ctx());
	}

	/**
	 * Cycle to next/previous model.
	 * Uses scoped models if available, otherwise all available models.
	 * @param direction - "forward" (default) or "backward"
	 * @returns The new model info, or undefined if only one model available
	 */
	async cycleModel(direction: "forward" | "backward" = "forward"): Promise<ModelCycleResult | undefined> {
		return modelControlCycleModel(direction, this._ctx());
	}

	// =========================================================================
	// Thinking Level Management
	// =========================================================================

	/**
	 * Set thinking level.
	 * Clamps to model capabilities based on available thinking levels.
	 * Saves to session and settings only if the level actually changes.
	 */
	setThinkingLevel(level: ThinkingLevel): void {
		modelControlSetThinkingLevel(level, this._ctx());
	}

	/**
	 * Cycle to next thinking level.
	 * @returns New level, or undefined if model doesn't support thinking
	 */
	cycleThinkingLevel(): ThinkingLevel | undefined {
		return modelControlCycleThinkingLevel(this._ctx());
	}

	/**
	 * Get available thinking levels for current model.
	 * The provider will clamp to what the specific model supports internally.
	 */
	getAvailableThinkingLevels(): ThinkingLevel[] {
		return modelControlGetAvailableThinkingLevels(this._ctx());
	}

	/**
	 * Check if current model supports thinking/reasoning.
	 */
	supportsThinking(): boolean {
		return modelControlSupportsThinking(this._ctx());
	}

	// =========================================================================
	// Queue Mode Management
	// =========================================================================

	private syncQueueModesFromSettings(): void {
		this.agent.steeringMode = this.settingsManager.getSteeringMode();
		this.agent.followUpMode = this.settingsManager.getFollowUpMode();
	}

	/**
	 * Set steering message mode.
	 * Saves to settings.
	 */
	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.agent.steeringMode = mode;
		this.settingsManager.setSteeringMode(mode);
	}

	/**
	 * Set follow-up message mode.
	 * Saves to settings.
	 */
	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.agent.followUpMode = mode;
		this.settingsManager.setFollowUpMode(mode);
	}

	// =========================================================================
	// Compaction
	// =========================================================================

	async compact(customInstructions?: string): Promise<CompactionResult> {
		return this._compaction.compact(customInstructions);
	}

	abortCompaction(): void {
		this._compaction.abortCompaction();
	}

	abortBranchSummary(): void {
		this._branchSummaryAbortController?.abort();
	}

	setAutoCompactionEnabled(enabled: boolean): void {
		this._compaction.setAutoCompactionEnabled(enabled);
	}

	get autoCompactionEnabled(): boolean {
		return this._compaction.autoCompactionEnabled;
	}

	async bindExtensions(bindings: ExtensionBindings): Promise<void> {
		if (bindings.uiContext !== undefined) {
			this._extensionUIContext = bindings.uiContext;
		}
		if (bindings.mode !== undefined) {
			this._extensionMode = bindings.mode;
		}
		if (bindings.commandContextActions !== undefined) {
			this._extensionCommandContextActions = bindings.commandContextActions;
		}
		if (bindings.abortHandler !== undefined) {
			this._extensionAbortHandler = bindings.abortHandler;
		}
		if (bindings.shutdownHandler !== undefined) {
			this._extensionShutdownHandler = bindings.shutdownHandler;
		}
		if (bindings.onError !== undefined) {
			this._extensionErrorListener = bindings.onError;
		}

		this._applyExtensionBindings(this._extensionRunner);
		await this._extensionRunner.emit(this._sessionStartEvent);
		await this.extendResourcesFromExtensions(this._sessionStartEvent.reason === "reload" ? "reload" : "startup");
	}

	private async extendResourcesFromExtensions(reason: "startup" | "reload"): Promise<void> {
		if (!this._extensionRunner.hasHandlers("resources_discover")) {
			return;
		}

		const { skillPaths, promptPaths, themePaths } = await this._extensionRunner.emitResourcesDiscover(
			this._cwd,
			reason,
		);

		if (skillPaths.length === 0 && promptPaths.length === 0 && themePaths.length === 0) {
			return;
		}

		const extensionPaths: ResourceExtensionPaths = {
			skillPaths: this.buildExtensionResourcePaths(skillPaths),
			promptPaths: this.buildExtensionResourcePaths(promptPaths),
			themePaths: this.buildExtensionResourcePaths(themePaths),
		};

		this._resourceLoader.extendResources(extensionPaths);
		this._baseSystemPrompt = this._rebuildSystemPrompt(this.getActiveToolNames());
		this.agent.state.systemPrompt = this._baseSystemPrompt;
	}

	private buildExtensionResourcePaths(entries: Array<{ path: string; extensionPath: string }>): Array<{
		path: string;
		metadata: { source: string; scope: "temporary"; origin: "top-level"; baseDir?: string };
	}> {
		return entries.map((entry) => {
			const source = this.getExtensionSourceLabel(entry.extensionPath);
			const baseDir = entry.extensionPath.startsWith("<") ? undefined : dirname(entry.extensionPath);
			return {
				path: entry.path,
				metadata: {
					source,
					scope: "temporary",
					origin: "top-level",
					baseDir,
				},
			};
		});
	}

	private getExtensionSourceLabel(extensionPath: string): string {
		if (extensionPath.startsWith("<")) {
			return `extension:${extensionPath.replace(/[<>]/g, "")}`;
		}
		const base = basename(extensionPath);
		const name = base.replace(/\.(ts|js)$/, "");
		return `extension:${name}`;
	}

	private _applyExtensionBindings(runner: ExtensionRunner): void {
		runner.setUIContext(this._extensionUIContext, this._extensionMode);
		runner.bindCommandContext(this._extensionCommandContextActions);

		this._extensionErrorUnsubscriber?.();
		this._extensionErrorUnsubscriber = this._extensionErrorListener
			? runner.onError(this._extensionErrorListener)
			: undefined;
	}

	private _refreshCurrentModelFromRegistry(): void {
		const currentModel = this.model;
		if (!currentModel) {
			return;
		}

		const refreshedModel = this._modelRegistry.find(currentModel.provider, currentModel.id);
		if (!refreshedModel || refreshedModel === currentModel) {
			return;
		}

		this.agent.state.model = refreshedModel;
	}

	private _bindExtensionCore(runner: ExtensionRunner): void {
		const getCommands = (): SlashCommandInfo[] => {
			const extensionCommands: SlashCommandInfo[] = runner.getRegisteredCommands().map((command) => ({
				name: command.invocationName,
				description: command.description,
				source: "extension",
				sourceInfo: command.sourceInfo,
			}));

			const templates: SlashCommandInfo[] = this.promptTemplates.map((template) => ({
				name: template.name,
				description: template.description,
				source: "prompt",
				sourceInfo: template.sourceInfo,
			}));

			const skills: SlashCommandInfo[] = this._resourceLoader.getSkills().skills.map((skill) => ({
				name: `skill:${skill.name}`,
				description: skill.description,
				source: "skill",
				sourceInfo: skill.sourceInfo,
			}));

			return [...extensionCommands, ...templates, ...skills];
		};

		runner.bindCore(
			{
				sendMessage: (message, options) => {
					this.sendCustomMessage(message, options).catch((err) => {
						runner.emitError({
							extensionPath: "<runtime>",
							event: "send_message",
							error: err instanceof Error ? err.message : String(err),
						});
					});
				},
				sendUserMessage: (content, options) => {
					this.sendUserMessage(content, options).catch((err) => {
						runner.emitError({
							extensionPath: "<runtime>",
							event: "send_user_message",
							error: err instanceof Error ? err.message : String(err),
						});
					});
				},
				appendEntry: (customType, data) => {
					this.sessionManager.appendCustomEntry(customType, data);
				},
				setSessionName: (name) => {
					this.setSessionName(name);
				},
				getSessionName: () => {
					return this.sessionManager.getSessionName();
				},
				setLabel: (entryId, label) => {
					this.sessionManager.appendLabelChange(entryId, label);
				},
				getActiveTools: () => this.getActiveToolNames(),
				getAllTools: () => this.getAllTools(),
				setActiveTools: (toolNames) => this.setActiveToolsByName(toolNames),
				refreshTools: (options) =>
					this._toolManager.refresh(this._baseTools, this._extensionRunner, this.getActiveToolNames(), {
						includeAllExtensionTools: options?.includeAllExtensionTools,
					}),
				getCommands,
				setModel: async (model) => {
					if (!this.modelRegistry.hasConfiguredAuth(model)) return false;
					await this.setModel(model);
					return true;
				},
				getThinkingLevel: () => this.thinkingLevel,
				setThinkingLevel: (level) => this.setThinkingLevel(level),
			},
			{
				getModel: () => this.model,
				isIdle: () => !this.isStreaming,
				getSignal: () => this.agent.signal,
				abort: () => {
					if (this._extensionAbortHandler) {
						this._extensionAbortHandler();
						return;
					}
					void this.abort();
				},
				hasPendingMessages: () => this.pendingMessageCount > 0,
				shutdown: () => {
					this._extensionShutdownHandler?.();
				},
				getContextUsage: () => this.getContextUsage(),
				compact: (options) => {
					void (async () => {
						try {
							const result = await this.compact(options?.customInstructions);
							options?.onComplete?.(result);
						} catch (error) {
							const err = error instanceof Error ? error : new Error(String(error));
							options?.onError?.(err);
						}
					})();
				},
				getSystemPrompt: () => this.systemPrompt,
				getSystemPromptOptions: () => this._baseSystemPromptOptions,
			},
			{
				registerProvider: (name, config) => {
					this._modelRegistry.registerProvider(name, config);
					this._refreshCurrentModelFromRegistry();
				},
				unregisterProvider: (name) => {
					this._modelRegistry.unregisterProvider(name);
					this._refreshCurrentModelFromRegistry();
				},
			},
		);
	}

	private _buildRuntime(options: {
		activeToolNames?: string[];
		flagValues?: Map<string, boolean | string>;
		includeAllExtensionTools?: boolean;
	}): void {
		const shellCommandPrefix = this.settingsManager.getShellCommandPrefix();
		const shellPath = this.settingsManager.getShellPath();
		const baseTools = this._baseToolsOverride
			? new Map(Object.entries(this._baseToolsOverride))
			: new Map(
					Object.entries(
						createToolSpecs(this._cwd, {
							bash: { commandPrefix: shellCommandPrefix, shellPath },
						}),
					),
				);

		this._baseTools = baseTools;

		const extensionsResult = this._resourceLoader.getExtensions();
		if (options.flagValues) {
			for (const [name, value] of options.flagValues) {
				extensionsResult.runtime.flagValues.set(name, value);
			}
		}

		this._extensionRunner = new ExtensionRunner(
			extensionsResult.extensions,
			extensionsResult.runtime,
			this._cwd,
			this.sessionManager,
			this._modelRegistry,
			this._subagentManager,
			this._skipWorkflowContinuation,
		);
		if (this._extensionRunnerRef) {
			this._extensionRunnerRef.current = this._extensionRunner;
		}
		this._installToolHooks();
		this._bindExtensionCore(this._extensionRunner);
		this._applyExtensionBindings(this._extensionRunner);

		const defaultActiveToolNames = this._baseToolsOverride
			? Object.keys(this._baseToolsOverride)
			: ["read", "bash", "edit", "write", "lsp"];
		const baseActiveToolNames =
			options.activeToolNames ??
			Array.from(new Set([...defaultActiveToolNames, ...this._toolManager.customNames()]));
		this._toolManager.refresh(this._baseTools, this._extensionRunner, [], {
			activeNames: baseActiveToolNames,
			includeAllExtensionTools: options.includeAllExtensionTools,
		});
	}

	async reload(): Promise<void> {
		const previousFlagValues = this._extensionRunner.getFlagValues();
		await emitSessionShutdownEvent(this._extensionRunner, { type: "session_shutdown", reason: "reload" });
		this.settingsManager.reload();
		this._installApiUsageLogger();
		this.syncQueueModesFromSettings();
		resetProviders();
		await this._resourceLoader.reload();
		this.syncWebModels();
		this._buildRuntime({
			activeToolNames: this.getActiveToolNames(),
			flagValues: previousFlagValues,
			includeAllExtensionTools: true,
		});

		const hasBindings =
			this._extensionUIContext ||
			this._extensionCommandContextActions ||
			this._extensionShutdownHandler ||
			this._extensionErrorListener;
		if (hasBindings) {
			await this._extensionRunner.emit({ type: "session_start", reason: "reload" });
			await this.extendResourcesFromExtensions("reload");
		}
	}

	// =========================================================================
	// Auto-Retry
	// =========================================================================

	abortRetry(): void {
		this._retry.abort();
	}

	get isRetrying(): boolean {
		return this._retry.isRetrying;
	}

	get autoRetryEnabled(): boolean {
		return this._retry.enabled;
	}

	setAutoRetryEnabled(enabled: boolean): void {
		this._retry.setEnabled(enabled);
	}

	// =========================================================================
	// Bash Execution
	// =========================================================================

	async executeBash(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { excludeFromContext?: boolean; operations?: BashOperations },
	): Promise<BashResult> {
		return this._bash.execute(command, onChunk, options);
	}

	recordBashResult(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void {
		this._bash.record(command, result, options);
	}

	abortBash(): void {
		this._bash.abort();
	}

	get isBashRunning(): boolean {
		return this._bash.isRunning;
	}

	get hasPendingBashMessages(): boolean {
		return this._bash.hasPendingMessages;
	}

	// =========================================================================
	// Session Management
	// =========================================================================

	/**
	 * Set a display name for the current session.
	 */
	setSessionName(name: string): void {
		this.sessionManager.appendSessionInfo(name);
		this._emit({ type: "session_info_changed", name: this.sessionManager.getSessionName() });
	}

	// =========================================================================
	// Tree Navigation
	// =========================================================================

	/**
	 * Navigate to a different node in the session tree.
	 *
	 * @param targetId The entry ID to navigate to
	 * @param options.summarize Whether user wants to summarize abandoned branch
	 * @param options.customInstructions Custom instructions for summarizer
	 * @param options.replaceInstructions If true, customInstructions replaces the default prompt
	 * @param options.label Label to attach to the branch summary entry
	 * @returns Result with editorText (if user message) and cancelled status
	 */
	async navigateTree(
		targetId: string,
		options: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string } = {},
	): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }> {
		return treeNavNavigateTree(targetId, options, this._ctx());
	}

	/**
	 * Get session statistics.
	 */
	getSessionStats(): SessionStats {
		return computeSessionStats(this._ctx());
	}

	getContextUsage(): ContextUsage | undefined {
		return computeContextUsage(this._ctx());
	}

	/**
	 * Export the current session branch to a JSONL file.
	 * Writes the session header followed by all entries on the current branch path.
	 * @param outputPath Target file path. If omitted, generates a timestamped file in cwd.
	 * @returns The resolved output file path.
	 */
	exportToJsonl(outputPath?: string): string {
		const filePath = resolvePath(
			outputPath ?? `session-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
			process.cwd(),
		);
		const dir = dirname(filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		const header: SessionHeader = {
			type: "session",
			version: SESSION_VERSION,
			id: this.sessionManager.getSessionId(),
			timestamp: new Date().toISOString(),
			cwd: this.sessionManager.getCwd(),
		};

		const branchEntries = this.sessionManager.getBranch();
		const lines = [JSON.stringify(header)];

		// Re-chain parentIds to form a linear sequence
		let prevId: string | null = null;
		for (const entry of branchEntries) {
			const linear = { ...entry, parentId: prevId };
			lines.push(JSON.stringify(linear));
			prevId = entry.id;
		}

		writeFileSync(filePath, `${lines.join("\n")}\n`);
		return filePath;
	}

	// =========================================================================
	// Utilities
	// =========================================================================

	/**
	 * Get text content of last assistant message.
	 * Useful for /copy command.
	 * @returns Text content, or undefined if no assistant message exists
	 */
	getLastAssistantText(): string | undefined {
		const lastAssistant = this.messages
			.slice()
			.reverse()
			.find((m) => {
				if (m.role !== "assistant") return false;
				const msg = m as AssistantMessage;
				// Skip aborted messages with no content
				if (msg.stopReason === "aborted" && msg.content.length === 0) return false;
				return true;
			});

		if (!lastAssistant) return undefined;

		let text = "";
		for (const content of (lastAssistant as AssistantMessage).content) {
			if (content.type === "text") {
				text += content.text;
			}
		}

		return text.trim() || undefined;
	}

	// =========================================================================
	// Extension System
	// =========================================================================

	createReplacedSessionContext(): ReplacedSessionContext {
		const context = Object.defineProperties(
			{},
			Object.getOwnPropertyDescriptors(this._extensionRunner.createCommandContext()),
		) as ReplacedSessionContext;
		context.sendMessage = (message, options) => this.sendCustomMessage(message, options);
		context.sendUserMessage = (content, options) => this.sendUserMessage(content, options);
		return context;
	}

	/**
	 * Check if extensions have handlers for a specific event type.
	 */
	hasExtensionHandlers(eventType: string): boolean {
		return this._extensionRunner.hasHandlers(eventType);
	}

	/**
	 * Get the extension runner (for setting UI context and error handlers).
	 */
	get extensionRunner(): ExtensionRunner {
		return this._extensionRunner;
	}

	/** Build a fresh runtime context on each call. */
	private _ctx(): AgentSessionContext {
		const self = this;
		return {
			cwd: self._cwd,
			sessionManager: self.sessionManager,
			settingsManager: self.settingsManager,
			modelRegistry: self.modelRegistry,
			resourceLoader: self.resourceLoader,
			extensionRunner: self.extensionRunner,
			emit: (event: AgentSessionEvent) => self._emit(event),
			state: self.state,
			stream: self.agent.stream,
			sessionFile: self.sessionFile,
			sessionId: self.sessionId,
			get model() {
				return this.state.model;
			},
			emitError: (error) => self._extensionRunner.emitError(error),
			scopedModels: self._scopedModels,
			get branchSummaryAbortController() {
				return self._branchSummaryAbortController;
			},
			set branchSummaryAbortController(v) {
				self._branchSummaryAbortController = v;
			},
			getRequiredRequestAuth: (model) => self._getRequiredRequestAuth(model),
		};
	}

	/** Subagent manager (undefined when subagents are disabled). */
	get subagentManager(): SubagentManager | undefined {
		return this._subagentManager;
	}
}
