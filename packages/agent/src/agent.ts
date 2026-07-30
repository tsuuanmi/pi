import {
	type AssistantMessage,
	type Message,
	type Model,
	type StreamOptions,
	stream,
	type Transport,
} from "@tsuuanmi/pi-ai";
import type { Static, TSchema } from "typebox";
import type { LoopDetectionOptions } from "#agent/loop-detector";
import type {
	AfterToolCallContext,
	AfterToolCallResult,
	AgentLoopConfig,
	AgentLoopTurnUpdate,
	BeforeToolCallContext,
	BeforeToolCallResult,
	ProviderRequestObserver,
	QueueMode,
	StreamFn,
	ToolExecutionMode,
} from "#agent/runtime/config";
import type { AgentEvent } from "#agent/runtime/events";
import {
	type AgentRuntime,
	type ContinueRequest,
	DefaultAgentRuntime,
	type PromptRequest,
	type RunRequest,
	type RunResult,
} from "#agent/runtime/runtime";
import type { AgentRunOptions, AgentRunResult } from "#agent/runtime/types";
import type { AgentMessage, AgentState } from "#agent/state/state";
import {
	createStructuredOutputPrompt,
	createStructuredOutputRepairPrompt,
	getStructuredOutputRetryLimit,
	parseStructuredOutput,
	type StructuredOutputOptions,
	type StructuredOutputResult,
} from "#agent/structured-output";
import { createToolRegistry, type RegisterToolOptions, registerTool as registerToolSet } from "#agent/tool/registry";
import type { AgentContext, AgentTool } from "#agent/tool/types";

export type { QueueMode } from "#agent/runtime/config";

function defaultConvertToLlm(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult",
	);
}

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const DEFAULT_MODEL = {
	id: "unknown",
	name: "unknown",
	api: "unknown",
	provider: "unknown",
	baseUrl: "",
	reasoning: false,
	input: [],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 0,
	maxTokens: 0,
} satisfies Model<any>;

type MutableAgentState = Omit<AgentState, "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"> & {
	isStreaming: boolean;
	streamingMessage?: AgentMessage;
	pendingToolCalls: Set<string>;
	errorMessage?: string;
};

function createMutableAgentState(
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>,
): MutableAgentState {
	let tools = initialState?.tools?.slice() ?? [];
	let messages = initialState?.messages?.slice() ?? [];

	return {
		systemPrompt: initialState?.systemPrompt ?? "",
		model: initialState?.model ?? DEFAULT_MODEL,
		thinkingLevel: initialState?.thinkingLevel ?? "off",
		get tools() {
			return tools;
		},
		set tools(nextTools: AgentTool<any>[]) {
			tools = nextTools.slice();
		},
		get messages() {
			return messages;
		},
		set messages(nextMessages: AgentMessage[]) {
			messages = nextMessages.slice();
		},
		isStreaming: false,
		streamingMessage: undefined,
		pendingToolCalls: new Set<string>(),
		errorMessage: undefined,
	};
}

/** Options for constructing an {@link Agent}. */
export interface AgentOptions {
	/** Stable name used by teams, orchestrators, logs, and tracing. */
	name?: string;
	/** Capability labels used by team/orchestrator scheduling. */
	capabilities?: readonly string[];
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
	convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	streamFn?: StreamFn;
	/** Agent runtime used to produce turns. Defaults to the built-in LLM/tool runtime. */
	runtime?: AgentRuntime;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	onPayload?: StreamOptions["onPayload"];
	onResponse?: StreamOptions["onResponse"];
	providerRequestObserver?: ProviderRequestObserver;
	beforeRun?: (
		context: { agent: Agent; input?: string; metadata?: Record<string, unknown> },
		signal?: AbortSignal,
	) => void | Promise<void>;
	afterRun?: (
		context: { agent: Agent; result?: AgentRunResult; error?: unknown; metadata?: Record<string, unknown> },
		signal?: AbortSignal,
	) => void | Promise<void>;
	extractStructured?: (output: string) => unknown;
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
	prepareNextTurn?: (
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	steeringMode?: QueueMode;
	followUpMode?: QueueMode;
	sessionId?: string;
	transport?: Transport;
	maxRetryDelayMs?: number;
	toolExecution?: ToolExecutionMode;
	/** Detect repeated assistant turns. Disabled by default; pass true for conservative tool-call detection. */
	loopDetection?: boolean | LoopDetectionOptions;
	/** Maximum assistant turns for each prompt/continuation run. Finite values are floored and clamped to at least 1. */
	maxTurns?: number;
	/** Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. */
	shouldPause?: () => boolean;
}

class PendingMessageQueue {
	private messages: AgentMessage[] = [];
	public mode: QueueMode;

	constructor(mode: QueueMode) {
		this.mode = mode;
	}

	enqueue(message: AgentMessage): void {
		this.messages.push(message);
	}

	hasItems(): boolean {
		return this.messages.length > 0;
	}

	drain(): AgentMessage[] {
		if (this.mode === "all") {
			const drained = this.messages.slice();
			this.messages = [];
			return drained;
		}

		const first = this.messages[0];
		if (!first) {
			return [];
		}
		this.messages = this.messages.slice(1);
		return [first];
	}

	clear(): void {
		this.messages = [];
	}
}

type ActiveRun = {
	promise: Promise<void>;
	resolve: () => void;
	abortController: AbortController;
};

/**
 * Stateful agent facade over a pluggable runtime stream.
 *
 * `Agent` owns the current transcript, emits lifecycle events, executes tools,
 * and exposes queueing APIs for steering and follow-up messages.
 */
export class Agent {
	private _state: MutableAgentState;
	private readonly listeners = new Set<(event: AgentEvent, signal: AbortSignal) => Promise<void> | void>();
	private readonly initialOptions: AgentOptions;
	private taskRunQueue: Promise<void> = Promise.resolve();

	readonly name: string;
	readonly capabilities: readonly string[];
	private readonly steeringQueue: PendingMessageQueue;
	private readonly followUpQueue: PendingMessageQueue;

	public convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	public transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	public streamFn: StreamFn;
	public runtime: AgentRuntime;
	public getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	public onPayload?: StreamOptions["onPayload"];
	public onResponse?: StreamOptions["onResponse"];
	public providerRequestObserver?: ProviderRequestObserver;
	public beforeRun?: AgentOptions["beforeRun"];
	public afterRun?: AgentOptions["afterRun"];
	public extractStructured?: AgentOptions["extractStructured"];
	public beforeToolCall?: (
		context: BeforeToolCallContext,
		signal?: AbortSignal,
	) => Promise<BeforeToolCallResult | undefined>;
	public afterToolCall?: (
		context: AfterToolCallContext,
		signal?: AbortSignal,
	) => Promise<AfterToolCallResult | undefined>;
	public prepareNextTurn?: (
		signal?: AbortSignal,
	) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
	private activeRun?: ActiveRun;
	/** Session identifier forwarded to providers for cache-aware backends. */
	public sessionId?: string;
	/** Preferred transport forwarded to the stream function. */
	public transport: Transport;
	/** Optional cap for provider-requested retry delays. */
	public maxRetryDelayMs?: number;
	/** Tool execution strategy for assistant messages that contain multiple tool calls. */
	public toolExecution: ToolExecutionMode;
	/** Optional repeated-turn detector configuration for this agent. */
	public loopDetection?: boolean | LoopDetectionOptions;
	/** Maximum assistant turns for each prompt/continuation run. */
	public maxTurns?: number;
	/** Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. */
	public shouldPause?: () => boolean;

	constructor(options: AgentOptions = {}) {
		this.initialOptions = options;
		this.name = options.name ?? "agent";
		this.capabilities = options.capabilities?.slice() ?? [];
		this._state = createMutableAgentState(options.initialState);
		this.convertToLlm = options.convertToLlm ?? defaultConvertToLlm;
		this.transformContext = options.transformContext;
		this.streamFn = options.streamFn ?? stream;
		this.runtime = options.runtime ?? new DefaultAgentRuntime(this.streamFn);
		this.getApiKey = options.getApiKey;
		this.onPayload = options.onPayload;
		this.onResponse = options.onResponse;
		this.providerRequestObserver = options.providerRequestObserver;
		this.beforeRun = options.beforeRun;
		this.afterRun = options.afterRun;
		this.extractStructured = options.extractStructured;
		this.beforeToolCall = options.beforeToolCall;
		this.afterToolCall = options.afterToolCall;
		this.prepareNextTurn = options.prepareNextTurn;
		this.steeringQueue = new PendingMessageQueue(options.steeringMode ?? "one-at-a-time");
		this.followUpQueue = new PendingMessageQueue(options.followUpMode ?? "one-at-a-time");
		this.sessionId = options.sessionId;
		this.transport = options.transport ?? "auto";
		this.maxRetryDelayMs = options.maxRetryDelayMs;
		this.toolExecution = options.toolExecution ?? "parallel";
		this.loopDetection = options.loopDetection;
		this.maxTurns = options.maxTurns;
		this.shouldPause = options.shouldPause;
	}

	/**
	 * Subscribe to agent lifecycle events.
	 *
	 * Listener promises are awaited in subscription order and are included in
	 * the current run's settlement. Listeners also receive the active abort
	 * signal for the current run.
	 *
	 * `agent_end` is the final emitted event for a run, but the agent does not
	 * become idle until all awaited listeners for that event have settled.
	 */
	subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Current agent state.
	 *
	 * Assigning `state.tools` or `state.messages` copies the provided top-level array.
	 */
	get state(): AgentState {
		return this._state;
	}

	/** Register tools by name, replacing existing tools with the same name. */
	registerTool(tools: Iterable<AgentTool>, options?: RegisterToolOptions): AgentTool[] {
		const registry = createToolRegistry(options?.replace ? [] : this._state.tools);
		registerToolSet(registry, tools, options);
		const nextTools = registry.list();
		this._state.tools = nextTools;
		return nextTools;
	}

	/** Controls how queued steering messages are drained. */
	set steeringMode(mode: QueueMode) {
		this.steeringQueue.mode = mode;
	}

	get steeringMode(): QueueMode {
		return this.steeringQueue.mode;
	}

	/** Controls how queued follow-up messages are drained. */
	set followUpMode(mode: QueueMode) {
		this.followUpQueue.mode = mode;
	}

	get followUpMode(): QueueMode {
		return this.followUpQueue.mode;
	}

	/** Queue a message to be injected after the current assistant turn finishes. */
	steer(message: AgentMessage): void {
		this.steeringQueue.enqueue(message);
	}

	/** Queue a message to run only after the agent would otherwise stop. */
	followUp(message: AgentMessage): void {
		this.followUpQueue.enqueue(message);
	}

	/** Remove all queued steering messages. */
	clearSteeringQueue(): void {
		this.steeringQueue.clear();
	}

	/** Remove all queued follow-up messages. */
	clearFollowUpQueue(): void {
		this.followUpQueue.clear();
	}

	/** Remove all queued steering and follow-up messages. */
	clearAllQueues(): void {
		this.clearSteeringQueue();
		this.clearFollowUpQueue();
	}

	/** Returns true when either queue still contains pending messages. */
	hasQueuedMessages(): boolean {
		return this.steeringQueue.hasItems() || this.followUpQueue.hasItems();
	}

	/** Active abort signal for the current run, if any. */
	get signal(): AbortSignal | undefined {
		return this.activeRun?.abortController.signal;
	}

	/** Abort the current run, if one is active. */
	abort(): void {
		this.activeRun?.abortController.abort();
	}

	/**
	 * Resolve when the current run and all awaited event listeners have finished.
	 *
	 * This resolves after `agent_end` listeners settle.
	 */
	waitForIdle(): Promise<void> {
		return this.activeRun?.promise ?? Promise.resolve();
	}

	/** Clear transcript state, runtime state, and queued messages. */
	reset(): void {
		this._state.messages = [];
		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		this._state.errorMessage = undefined;
		this.clearFollowUpQueue();
		this.clearSteeringQueue();
	}

	/**
	 * Tear down the current runtime after the active run settles.
	 *
	 * Custom runtimes can release external processes, sockets, or protocol sessions here.
	 */
	async dispose(): Promise<void> {
		await this.waitForIdle();
		await this.runtime.dispose?.();
	}

	/** Return a stable state snapshot for observers and tests. */
	getState(): AgentState {
		return this._state;
	}

	/** Return a transcript snapshot. */
	getHistory(): AgentMessage[] {
		return this._state.messages.slice();
	}

	/** Run an isolated fresh prompt and return the final assistant result. */
	async run(input: string, options: AgentRunOptions = {}): Promise<AgentRunResult> {
		const execute = async (): Promise<AgentRunResult> => {
			const clone = this.createIsolatedRunAgent();
			await clone.beforeRun?.({ agent: clone, input, metadata: options.metadata }, options.signal);
			try {
				await clone.prompt(input, { signal: options.signal });
				const assistant = clone.findLastAssistantMessage();
				const output = assistant ? getAssistantText(assistant) : "";
				const structured = this.extractStructured?.(output);
				const result: AgentRunResult = {
					success: !clone.state.errorMessage,
					output,
					...(structured !== undefined ? { structured } : {}),
					...(clone.state.errorMessage ? { error: clone.state.errorMessage } : {}),
				};
				await clone.afterRun?.({ agent: clone, result, metadata: options.metadata }, options.signal);
				return result;
			} catch (error) {
				const result: AgentRunResult = { success: false, output: "", error };
				await clone.afterRun?.({ agent: clone, result, error, metadata: options.metadata }, options.signal);
				return result;
			}
		};

		return this.enqueueTaskRun(execute);
	}

	/** Start a new persistent prompt from text, a single message, or a batch of messages. */
	async prompt(message: AgentMessage | AgentMessage[], options?: AgentRunOptions): Promise<void>;
	async prompt(input: string, options?: AgentRunOptions): Promise<void>;
	async prompt(input: string | AgentMessage | AgentMessage[], options: AgentRunOptions = {}): Promise<void> {
		if (this.activeRun) {
			throw new Error(
				"Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
			);
		}
		const messages = this.normalizePromptInput(input);
		await this.runPromptMessages(messages, { signal: options.signal });
	}

	/** Prompt the model for JSON that matches a TypeBox schema, then validate and return it. */
	async promptStructured<TSchemaValue extends TSchema>(
		input: string,
		options: StructuredOutputOptions<TSchemaValue>,
	): Promise<StructuredOutputResult<Static<TSchemaValue>>> {
		const retryLimit = getStructuredOutputRetryLimit(options.retryOnInvalid);
		let prompt = createStructuredOutputPrompt(input, options);
		let result: StructuredOutputResult<Static<TSchemaValue>> | undefined;

		for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
			await this.prompt(prompt);
			const assistant = this.findLastAssistantMessage();
			const rawText = assistant ? getAssistantText(assistant) : "";
			result = parseStructuredOutput(rawText, options.schema);
			await this.emitOutOfBand({
				type: "structured_output",
				ok: result.ok,
				attempt: attempt + 1,
				...(result.ok
					? { preview: result.jsonText.slice(0, 240) }
					: { error: result.error, issues: result.issues, preview: rawText.slice(0, 240) }),
			});
			if (result.ok || attempt === retryLimit) return result;
			prompt = createStructuredOutputPrompt(createStructuredOutputRepairPrompt(result), options);
		}

		return result ?? { ok: false, error: "Structured output did not run", rawText: "" };
	}

	/** Continue from the current transcript. The last message must be a user or tool-result message. */
	async continue(): Promise<void> {
		if (this.activeRun) {
			throw new Error("Agent is already processing. Wait for completion before continuing.");
		}

		const lastMessage = this._state.messages[this._state.messages.length - 1];
		if (!lastMessage) {
			throw new Error("No messages to continue from");
		}

		if (lastMessage.role === "assistant") {
			const queuedSteering = this.steeringQueue.drain();
			if (queuedSteering.length > 0) {
				await this.runPromptMessages(queuedSteering, { skipInitialSteeringPoll: true });
				return;
			}

			const queuedFollowUps = this.followUpQueue.drain();
			if (queuedFollowUps.length > 0) {
				await this.runPromptMessages(queuedFollowUps);
				return;
			}

			throw new Error("Cannot continue from message role: assistant");
		}

		await this.runContinuation();
	}

	private createIsolatedRunAgent(): Agent {
		return new Agent({
			...this.initialOptions,
			name: this.name,
			capabilities: this.capabilities,
			initialState: {
				systemPrompt: this._state.systemPrompt,
				model: this._state.model,
				thinkingLevel: this._state.thinkingLevel,
				tools: this._state.tools.slice(),
				messages: [],
			},
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			streamFn: this.streamFn,
			runtime: this.runtime,
			getApiKey: this.getApiKey,
			onPayload: this.onPayload,
			onResponse: this.onResponse,
			providerRequestObserver: this.providerRequestObserver,
			beforeRun: this.beforeRun,
			afterRun: this.afterRun,
			extractStructured: this.extractStructured,
			beforeToolCall: this.beforeToolCall,
			afterToolCall: this.afterToolCall,
			prepareNextTurn: this.prepareNextTurn,
			steeringMode: this.steeringMode,
			followUpMode: this.followUpMode,
			sessionId: this.sessionId,
			transport: this.transport,
			maxRetryDelayMs: this.maxRetryDelayMs,
			toolExecution: this.toolExecution,
			loopDetection: this.loopDetection,
			maxTurns: this.maxTurns,
			shouldPause: this.shouldPause,
		});
	}

	private async enqueueTaskRun<T>(execute: () => Promise<T>): Promise<T> {
		const previous = this.taskRunQueue;
		let release!: () => void;
		this.taskRunQueue = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await execute();
		} finally {
			release();
		}
	}

	private normalizePromptInput(input: string | AgentMessage | AgentMessage[]): AgentMessage[] {
		if (Array.isArray(input)) {
			return input;
		}

		if (typeof input !== "string") {
			return [input];
		}

		return [{ role: "user", content: [{ type: "text", text: input }], timestamp: Date.now() }];
	}

	private async runPromptMessages(
		messages: AgentMessage[],
		options: { skipInitialSteeringPoll?: boolean; signal?: AbortSignal } = {},
	): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			const request: PromptRequest = {
				kind: "prompt",
				messages,
				context: this.createContextSnapshot(),
				config: this.createLoopConfig(options),
				emit: async () => {},
				signal,
				streamFn: this.streamFn,
			};
			await this.runRuntime(request);
		}, options.signal);
	}

	private async runContinuation(): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			const request: ContinueRequest = {
				kind: "continue",
				context: this.createContextSnapshot(),
				config: this.createLoopConfig(),
				emit: async () => {},
				signal,
				streamFn: this.streamFn,
			};
			await this.runRuntime(request);
		});
	}

	private async runRuntime(request: RunRequest): Promise<RunResult> {
		let result: RunResult | undefined;
		for await (const event of this.runtime.stream(request)) {
			if (event.type === "event") {
				await this.processEvents(event.event);
			} else if (event.type === "backend") {
				void event.backend;
			} else if (event.type === "warning") {
				await this.processEvents({ type: "runtime_warning", warning: event.warning });
			} else if (event.type === "trace") {
				await this.processEvents({ type: "runtime_trace", trace: event.trace });
			} else if (event.type === "done") {
				result = event.result;
			} else {
				throw event.error;
			}
		}
		if (!result) {
			throw new Error("Agent runtime stream ended without a done event");
		}
		return result;
	}

	private createContextSnapshot(): AgentContext {
		return {
			systemPrompt: this._state.systemPrompt,
			messages: this._state.messages.slice(),
			tools: this._state.tools.slice(),
		};
	}

	private createLoopConfig(options: { skipInitialSteeringPoll?: boolean } = {}): AgentLoopConfig {
		let skipInitialSteeringPoll = options.skipInitialSteeringPoll === true;
		return {
			model: this._state.model,
			reasoning: this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel,
			sessionId: this.sessionId,
			onPayload: this.onPayload,
			onResponse: this.onResponse,
			providerRequestObserver: this.providerRequestObserver,
			transport: this.transport,
			maxRetryDelayMs: this.maxRetryDelayMs,
			toolExecution: this.toolExecution,
			loopDetection: this.loopDetection,
			maxTurns: this.maxTurns,
			beforeToolCall: this.beforeToolCall,
			afterToolCall: this.afterToolCall,
			prepareNextTurn: this.prepareNextTurn ? async () => await this.prepareNextTurn?.(this.signal) : undefined,
			convertToLlm: this.convertToLlm,
			transformContext: this.transformContext,
			getApiKey: this.getApiKey,
			getSteeringMessages: async () => {
				if (skipInitialSteeringPoll) {
					skipInitialSteeringPoll = false;
					return [];
				}
				return this.steeringQueue.drain();
			},
			getFollowUpMessages: async () => this.followUpQueue.drain(),
			shouldStopAfterTurn: this.shouldPause ? () => this.shouldPause?.() === true : undefined,
		};
	}

	private async runWithLifecycle(
		executor: (signal: AbortSignal) => Promise<void>,
		externalSignal?: AbortSignal,
	): Promise<void> {
		if (this.activeRun) {
			throw new Error("Agent is already processing.");
		}

		const abortController = new AbortController();
		const abortFromExternal = () => abortController.abort(externalSignal?.reason);
		if (externalSignal?.aborted) {
			abortFromExternal();
		} else {
			externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
		}

		let resolvePromise = () => {};
		const promise = new Promise<void>((resolve) => {
			resolvePromise = resolve;
		});
		this.activeRun = { promise, resolve: resolvePromise, abortController };

		this._state.isStreaming = true;
		this._state.streamingMessage = undefined;
		this._state.errorMessage = undefined;

		try {
			await this.emitOutOfBand({
				type: "agent_status",
				status: "running",
				trace: this.createTrace("agent.run.start"),
			});
			await executor(abortController.signal);
		} catch (error) {
			await this.emitOutOfBand({
				type: "agent_status",
				status: abortController.signal.aborted ? "aborted" : "failed",
				trace: this.createTrace("agent.run.error"),
			});
			await this.handleRunFailure(error, abortController.signal.aborted);
		} finally {
			externalSignal?.removeEventListener("abort", abortFromExternal);
			this.finishRun();
		}
	}

	private async handleRunFailure(error: unknown, aborted: boolean): Promise<void> {
		const failureMessage = {
			role: "assistant",
			content: [{ type: "text", text: "" }],
			api: this._state.model.api,
			provider: this._state.model.provider,
			model: this._state.model.id,
			usage: EMPTY_USAGE,
			stopReason: aborted ? "aborted" : "error",
			errorMessage: error instanceof Error ? error.message : String(error),
			timestamp: Date.now(),
		} satisfies AgentMessage;
		await this.processEvents({ type: "message_start", message: failureMessage });
		await this.processEvents({ type: "message_end", message: failureMessage });
		await this.processEvents({ type: "turn_end", message: failureMessage, toolResults: [] });
		await this.processEvents({ type: "agent_end", messages: [failureMessage] });
	}

	private finishRun(): void {
		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		this.activeRun?.resolve();
		this.activeRun = undefined;
	}

	/**
	 * Reduce internal state for a loop event, then await listeners.
	 *
	 * `agent_end` only means no further loop events will be emitted. The run is
	 * considered idle later, after all awaited listeners for `agent_end` finish
	 * and `finishRun()` clears runtime-owned state.
	 */
	private findLastAssistantMessage(): AssistantMessage | undefined {
		for (let index = this._state.messages.length - 1; index >= 0; index -= 1) {
			const message = this._state.messages[index];
			if (message?.role === "assistant") return message;
		}
		return undefined;
	}

	private createTrace(name: string): {
		type: "trace";
		name: string;
		timestamp: number;
		details?: Record<string, unknown>;
	} {
		return { type: "trace", name, timestamp: Date.now(), details: { agent: this.name } };
	}

	private async emitOutOfBand(event: AgentEvent): Promise<void> {
		const abortController = new AbortController();
		for (const listener of this.listeners) {
			await listener(event, abortController.signal);
		}
	}

	private async processEvents(event: AgentEvent): Promise<void> {
		switch (event.type) {
			case "message_start":
				this._state.streamingMessage = event.message;
				break;

			case "message_update":
				this._state.streamingMessage = event.message;
				break;

			case "message_end":
				this._state.streamingMessage = undefined;
				this._state.messages.push(event.message);
				break;

			case "tool_execution_start": {
				const pendingToolCalls = new Set(this._state.pendingToolCalls);
				pendingToolCalls.add(event.toolCallId);
				this._state.pendingToolCalls = pendingToolCalls;
				break;
			}

			case "tool_execution_end": {
				const pendingToolCalls = new Set(this._state.pendingToolCalls);
				pendingToolCalls.delete(event.toolCallId);
				this._state.pendingToolCalls = pendingToolCalls;
				break;
			}

			case "turn_end":
				if (event.message.role === "assistant" && event.message.errorMessage) {
					this._state.errorMessage = event.message.errorMessage;
				}
				break;

			case "agent_end":
				this._state.streamingMessage = undefined;
				break;
		}

		const signal = this.activeRun?.abortController.signal;
		if (!signal) {
			throw new Error("Agent listener invoked outside active run");
		}
		for (const listener of this.listeners) {
			await listener(event, signal);
		}
	}
}
