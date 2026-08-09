import {
	type AssistantMessage,
	type Message as LlmMessage,
	type StreamOptions,
	stream,
	type Transport,
} from "@tsuuanmi/pi-ai";
import type { Static, TSchema } from "typebox";
import { EMPTY_USAGE } from "#agent/agent/defaults";
import { AgentEventDispatcher, type AgentListener } from "#agent/agent/event-dispatcher";
import { AgentHookRegistry, runAfterHooks, runBeforeHooks } from "#agent/agent/hook-registry";
import { type ActiveRun, combineSignals } from "#agent/agent/lifecycle";
import type { LoopDetectionOptions } from "#agent/agent/loop-detector";
import type { AgentOptions } from "#agent/agent/options";
import { MessageQueue } from "#agent/agent/queue";
import type { AgentState } from "#agent/agent/state";
import { createAgentState, type MutableAgentState } from "#agent/agent/state";
import {
	createStructuredOutputPrompt,
	createStructuredOutputRepairPrompt,
	getStructuredOutputRetryLimit,
	parseStructuredOutput,
	type StructuredOutputOptions,
	type StructuredOutputResult,
} from "#agent/agent/structured-output";
import { textOf } from "#agent/agent/text";
import type {
	AgentLoopConfig,
	Clock,
	ProviderRequestObserver,
	QueueMode,
	RequestIdFactory,
	ToolExecutionMode,
} from "#agent/config";
import type { Context } from "#agent/context";
import { createLoopHooks } from "#agent/hook-adapter";
import type { AgentHook } from "#agent/hooks";
import { runContinue, runPrompt } from "#agent/loop";
import { convertToLlm } from "#agent/messages/messages";
import type { AgentMessage } from "#agent/messages/types";
import type { AgentRunOptions, AgentRunResult } from "#agent/run";
import type { StreamFunction } from "#agent/stream";
import { ToolRegistry } from "#agent/tool/registry";
import type { Tool } from "#agent/tool/tool";

export type { QueueMode } from "#agent/config";

/**
 * Stateful agent facade over the model and tool loop.
 *
 * `Agent` owns the current transcript, emits lifecycle events, executes tools,
 * and exposes queueing APIs for steering and follow-up messages.
 */
export class Agent {
	private _state: MutableAgentState;
	private readonly events: AgentEventDispatcher;
	private readonly initialOptions: AgentOptions;
	private readonly hookRegistry: AgentHookRegistry;
	private taskRunQueue: Promise<void> = Promise.resolve();

	readonly name: string;
	readonly capabilities: readonly string[];
	private readonly steeringQueue: MessageQueue;
	private readonly followUpQueue: MessageQueue;

	public convertToLlm: (messages: AgentMessage[]) => LlmMessage[] | Promise<LlmMessage[]>;
	public transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	public stream: StreamFunction;
	public getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	public onPayload?: StreamOptions["onPayload"];
	public onResponse?: StreamOptions["onResponse"];
	public providerRequestObserver?: ProviderRequestObserver;
	public now: Clock;
	public createRequestId?: RequestIdFactory;
	public requestTimeoutMs?: number;
	public extractStructured?: AgentOptions["extractStructured"];
	private activeRun?: ActiveRun;
	private disposed = false;
	private disposePromise?: Promise<void>;
	private readonly disposeController = new AbortController();
	/** Session identifier forwarded to providers for cache-aware requests. */
	public sessionId?: string;
	/** Preferred transport forwarded to the stream function. */
	public transport: Transport;
	/** Optional cap for provider-requested retry delays. */
	public maxRetryDelayMs?: number;
	/** Tool execution strategy for assistant messages that contain multiple tool calls. */
	public toolExecution: ToolExecutionMode;
	/** Maximum concurrently executing tools for parallel tool batches. */
	public maxToolConcurrency?: number;
	/** Maximum text characters emitted from each tool result. */
	public maxToolOutputChars?: number;
	/** Optional repeated-turn detector configuration for this agent. */
	public loopDetection?: boolean | LoopDetectionOptions;
	/** Maximum assistant turns for each prompt/continuation run. */
	public maxTurns?: number;
	/** Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. */
	public shouldPause?: () => boolean;

	constructor(options: AgentOptions = {}) {
		this.initialOptions = options;
		this.hookRegistry = new AgentHookRegistry(options.hooks);
		this.name = options.name ?? "agent";
		this.capabilities = options.capabilities?.slice() ?? [];
		this._state = createAgentState(options.initialState);
		this.events = new AgentEventDispatcher(this._state, () => this.activeRun?.abortController.signal);
		this.convertToLlm = options.convertToLlm ?? convertToLlm;
		this.transformContext = options.transformContext;
		this.stream = options.stream ?? stream;
		this.getApiKey = options.getApiKey;
		this.onPayload = options.onPayload;
		this.onResponse = options.onResponse;
		this.providerRequestObserver = options.providerRequestObserver;
		this.now = options.now ?? Date.now;
		this.createRequestId = options.createRequestId;
		this.requestTimeoutMs = options.requestTimeoutMs;
		this.extractStructured = options.extractStructured;
		this.steeringQueue = new MessageQueue(options.steeringMode ?? "one-at-a-time");
		this.followUpQueue = new MessageQueue(options.followUpMode ?? "one-at-a-time");
		this.sessionId = options.sessionId;
		this.transport = options.transport ?? "auto";
		this.maxRetryDelayMs = options.maxRetryDelayMs;
		this.toolExecution = options.toolExecution ?? "parallel";
		this.maxToolConcurrency = options.maxToolConcurrency;
		this.maxToolOutputChars = options.maxToolOutputChars;
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
	subscribe(listener: AgentListener): () => void {
		return this.events.subscribe(listener);
	}

	/** Register an agent lifecycle or execution hook. */
	registerHook(hook: AgentHook): () => void {
		this.assertNotDisposed();
		return this.hookRegistry.register(hook);
	}

	/** Current agent state. */
	get state(): AgentState {
		return this._state;
	}

	/** Replace the active tool set with validated, name-unique tools. */
	setTools(tools: Iterable<Tool>): Tool[] {
		this.assertNotDisposed();
		const registry = new ToolRegistry(tools);
		const nextTools = registry.list();
		this._state.tools = nextTools;
		return [...nextTools];
	}

	/** Return a snapshot of the active tools. */
	getTools(): Tool[] {
		return [...this._state.tools];
	}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error("Agent has been disposed");
		}
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
		this.assertNotDisposed();
		this.steeringQueue.enqueue(message);
	}

	/** Queue a message to run only after the agent would otherwise stop. */
	followUp(message: AgentMessage): void {
		this.assertNotDisposed();
		this.followUpQueue.enqueue(message);
	}

	/** Remove all queued steering messages. */
	clearSteeringQueue(): void {
		this.assertNotDisposed();
		this.steeringQueue.clear();
	}

	/** Remove all queued follow-up messages. */
	clearFollowUpQueue(): void {
		this.assertNotDisposed();
		this.followUpQueue.clear();
	}

	/** Remove all queued steering and follow-up messages. */
	clearAllQueues(): void {
		this.assertNotDisposed();
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

	/** Clear transcript state and queued messages. */
	reset(): void {
		this.assertNotDisposed();
		this._state.messages = [];
		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		this._state.errorMessage = undefined;
		this.clearFollowUpQueue();
		this.clearSteeringQueue();
	}

	/** Tear down the agent after the active run settles. */
	async dispose(): Promise<void> {
		if (this.disposePromise) {
			return this.disposePromise;
		}

		this.disposed = true;
		this.steeringQueue.clear();
		this.followUpQueue.clear();
		this.disposeController.abort();
		this.abort();
		this.disposePromise = (async () => {
			try {
				await this.waitForIdle();
				await this.taskRunQueue;
			} finally {
				this.hookRegistry.clear();
				this.events.clear();
			}
		})();
		return this.disposePromise;
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
		this.assertNotDisposed();
		const execute = async (): Promise<AgentRunResult> => {
			this.assertNotDisposed();
			const clone = this.createIsolatedRunAgent();
			const signal = combineSignals([options.signal, this.disposeController.signal]);
			const hooks = clone.hookRegistry.snapshot();
			await runBeforeHooks(hooks, { agent: clone, input, metadata: options.metadata }, signal);

			let result: AgentRunResult;
			let failed = false;
			try {
				await clone.prompt(input, { signal });
				const agentMessage = clone.findLastAgentMessage();
				const output = agentMessage ? textOf(agentMessage) : "";
				const structured = this.extractStructured?.(output);
				result = {
					success: !clone.state.errorMessage,
					output,
					...(structured !== undefined ? { structured } : {}),
					...(clone.state.errorMessage ? { error: clone.state.errorMessage } : {}),
				};
			} catch (error) {
				failed = true;
				result = { success: false, output: "", error };
			}

			await runAfterHooks(
				hooks,
				{
					agent: clone,
					result,
					...(failed ? { error: result.error } : {}),
					metadata: options.metadata,
				},
				signal,
			);
			return result;
		};

		return this.enqueueTaskRun(execute);
	}

	/** Start a new persistent prompt from text, a single message, or a batch of messages. */
	async prompt(message: AgentMessage | AgentMessage[], options?: AgentRunOptions): Promise<void>;
	async prompt(input: string, options?: AgentRunOptions): Promise<void>;
	async prompt(input: string | AgentMessage | AgentMessage[], options: AgentRunOptions = {}): Promise<void> {
		this.assertNotDisposed();
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
			const agentMessage = this.findLastAgentMessage();
			const rawText = agentMessage ? textOf(agentMessage) : "";
			result = parseStructuredOutput(rawText, options.schema);
			await this.events.emitOutOfBand({
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
		this.assertNotDisposed();
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
			stream: this.stream,
			getApiKey: this.getApiKey,
			onPayload: this.onPayload,
			onResponse: this.onResponse,
			providerRequestObserver: this.providerRequestObserver,
			now: this.now,
			createRequestId: this.createRequestId,
			requestTimeoutMs: this.requestTimeoutMs,
			hooks: this.hookRegistry.snapshot(),
			extractStructured: this.extractStructured,
			steeringMode: this.steeringMode,
			followUpMode: this.followUpMode,
			sessionId: this.sessionId,
			transport: this.transport,
			maxRetryDelayMs: this.maxRetryDelayMs,
			toolExecution: this.toolExecution,
			maxToolConcurrency: this.maxToolConcurrency,
			loopDetection: this.loopDetection,
			maxTurns: this.maxTurns,
			shouldPause: this.shouldPause,
			maxToolOutputChars: this.maxToolOutputChars,
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

		return [{ role: "user", content: [{ type: "text", text: input }], timestamp: this.now() }];
	}

	private async runPromptMessages(
		messages: AgentMessage[],
		options: { skipInitialSteeringPoll?: boolean; signal?: AbortSignal } = {},
	): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			await runPrompt(
				messages,
				this.createContextSnapshot(),
				this.createLoopConfig(options),
				(event) => this.events.process(event),
				signal,
				this.stream,
			);
		}, options.signal);
	}

	private async runContinuation(): Promise<void> {
		await this.runWithLifecycle(async (signal) => {
			await runContinue(
				this.createContextSnapshot(),
				this.createLoopConfig(),
				(event) => this.events.process(event),
				signal,
				this.stream,
			);
		});
	}

	private createContextSnapshot(): Context {
		return {
			systemPrompt: this._state.systemPrompt,
			messages: this._state.messages.slice(),
			tools: this._state.tools.slice(),
		};
	}

	private createLoopConfig(options: { skipInitialSteeringPoll?: boolean } = {}): AgentLoopConfig {
		let skipInitialSteeringPoll = options.skipInitialSteeringPoll === true;
		const loopHooks = createLoopHooks(this.hookRegistry.snapshot(), () => this.signal);
		return {
			model: this._state.model,
			reasoning: this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel,
			sessionId: this.sessionId,
			onPayload: this.onPayload,
			onResponse: this.onResponse,
			providerRequestObserver: this.providerRequestObserver,
			now: this.now,
			createRequestId: this.createRequestId,
			requestTimeoutMs: this.requestTimeoutMs,
			transport: this.transport,
			maxRetryDelayMs: this.maxRetryDelayMs,
			toolExecution: this.toolExecution,
			maxToolConcurrency: this.maxToolConcurrency,
			maxToolOutputChars: this.maxToolOutputChars,
			loopDetection: this.loopDetection,
			maxTurns: this.maxTurns,
			...loopHooks,
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
			await this.events.emitOutOfBand({
				type: "agent_status",
				status: "running",
				trace: this.createTrace("agent.run.start"),
			});
			await executor(abortController.signal);
		} catch (error) {
			await this.events.emitOutOfBand({
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
			timestamp: this.now(),
		} satisfies AgentMessage;
		await this.events.process({ type: "message_start", message: failureMessage });
		await this.events.process({ type: "message_end", message: failureMessage });
		await this.events.process({ type: "turn_end", message: failureMessage, toolResults: [] });
		await this.events.process({ type: "agent_end", messages: [failureMessage] });
	}

	private finishRun(): void {
		this._state.isStreaming = false;
		this._state.streamingMessage = undefined;
		this._state.pendingToolCalls = new Set<string>();
		this.activeRun?.resolve();
		this.activeRun = undefined;
	}

	/** Find the latest assistant message in the transcript. */
	private findLastAgentMessage(): AssistantMessage | undefined {
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
		return { type: "trace", name, timestamp: this.now(), details: { agent: this.name } };
	}
}
