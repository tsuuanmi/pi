/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */

import {
	type AssistantMessage,
	type AssistantMessageEvent,
	type Context,
	EventStream,
	stream,
	type ToolResultMessage,
	validateToolArguments,
} from "@tsuuanmi/pi-ai";
import { Compile } from "typebox/compile";
import { LoopDetector, normalizeLoopDetectionOptions } from "#agent/agent/loop-detector";
import type { AgentMessage, TraceSpan, TraceStatus } from "#agent/messages/state";
import type { AgentLoopConfig, StreamFn, ToolCall } from "#agent/runtime/config";
import type { AgentContext } from "#agent/runtime/context";
import type { AgentEvent, ToolExecutionMeta, ToolExecutionStatus } from "#agent/runtime/events";
import { limitToolOutput, normalizeToolOutputLimit } from "#agent/tool/output";
import type { ToolResult } from "#agent/tool/result";
import type { Tool } from "#agent/tool/tool";

const detailsValidatorCache = new WeakMap<object, ReturnType<typeof Compile>>();
let providerRequestSequence = 0;

function nextProviderRequestSequence(): number {
	providerRequestSequence += 1;
	return providerRequestSequence;
}

function defaultRequestId(sequence: number, startedAt: number): string {
	return `llm_${startedAt.toString(36)}_${sequence.toString(36)}`;
}

function getNow(config: AgentLoopConfig): () => number {
	return config.now ?? Date.now;
}

async function observeProviderRequest(callback: (() => void | Promise<void>) | undefined): Promise<void> {
	if (!callback) return;
	try {
		await callback();
	} catch {
		// Provider request observers are best-effort and must not affect agent runs.
	}
}

type EventSink = (event: AgentEvent) => Promise<void> | void;

/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	const stream = createAgentStream();

	void runAgentLoop(
		prompts,
		context,
		config,
		async (event) => {
			stream.push(event);
		},
		signal,
		streamFn,
	).then((messages) => {
		stream.end(messages);
	});

	return stream;
}

/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 *
 * **Important:** The last message in context must convert to a `user` or `toolResult` message
 * via `convertToLlm`. If it doesn't, the LLM provider will reject the request.
 * This cannot be validated here since `convertToLlm` is only called once per turn.
 */
export function agentLoopContinue(
	context: AgentContext,
	config: AgentLoopConfig,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const stream = createAgentStream();

	void runAgentLoopContinue(
		context,
		config,
		async (event) => {
			stream.push(event);
		},
		signal,
		streamFn,
	).then((messages) => {
		stream.end(messages);
	});

	return stream;
}

export async function runAgentLoop(
	prompts: AgentMessage[],
	context: AgentContext,
	config: AgentLoopConfig,
	emit: EventSink,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): Promise<AgentMessage[]> {
	const newMessages: AgentMessage[] = [...prompts];
	const currentContext: AgentContext = {
		...context,
		messages: [...context.messages, ...prompts],
	};

	await emit({ type: "agent_start" });
	await emit({ type: "turn_start" });
	for (const prompt of prompts) {
		await emit({ type: "message_start", message: prompt });
		await emit({ type: "message_end", message: prompt });
	}

	await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
	return newMessages;
}

export async function runAgentLoopContinue(
	context: AgentContext,
	config: AgentLoopConfig,
	emit: EventSink,
	signal?: AbortSignal,
	streamFn?: StreamFn,
): Promise<AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const newMessages: AgentMessage[] = [];
	const currentContext: AgentContext = { ...context };

	await emit({ type: "agent_start" });
	await emit({ type: "turn_start" });

	await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
	return newMessages;
}

function createAgentStream(): EventStream<AgentEvent, AgentMessage[]> {
	return new EventStream<AgentEvent, AgentMessage[]>(
		(event: AgentEvent) => event.type === "agent_end",
		(event: AgentEvent) => (event.type === "agent_end" ? event.messages : []),
	);
}

function normalizeMaxTurns(maxTurns: number | undefined): number | undefined {
	if (maxTurns === undefined || !Number.isFinite(maxTurns)) {
		return undefined;
	}
	return Math.max(1, Math.floor(maxTurns));
}

function normalizeMaxToolConcurrency(maxToolConcurrency: number | undefined): number | undefined {
	if (maxToolConcurrency === undefined || !Number.isFinite(maxToolConcurrency)) {
		return undefined;
	}
	return Math.max(1, Math.floor(maxToolConcurrency));
}

function getToolOutputLimit(config: AgentLoopConfig, tool: Tool<any> | undefined): number | undefined {
	return normalizeToolOutputLimit(tool?.maxOutputChars ?? config.maxToolOutputChars);
}

function normalizeRequestTimeoutMs(requestTimeoutMs: number | undefined): number | undefined {
	if (requestTimeoutMs === undefined || !Number.isFinite(requestTimeoutMs)) {
		return undefined;
	}
	return Math.max(1, Math.floor(requestTimeoutMs));
}

class RequestTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Provider request timed out after ${timeoutMs}ms`);
		this.name = "RequestTimeoutError";
	}
}

interface ProviderRequestSignal {
	signal?: AbortSignal;
	aborted: () => boolean;
	timedOut: () => boolean;
	dispose: () => void;
}

function createProviderRequestSignal(
	parent: AbortSignal | undefined,
	timeoutMs: number | undefined,
): ProviderRequestSignal {
	const normalizedTimeoutMs = normalizeRequestTimeoutMs(timeoutMs);
	if (normalizedTimeoutMs === undefined) {
		return {
			signal: parent,
			aborted: () => parent?.aborted === true,
			timedOut: () => false,
			dispose: () => {},
		};
	}

	const controller = new AbortController();
	let timedOut = false;
	const abortFromParent = () => controller.abort(parent?.reason);
	const abortFromTimeout = () => {
		timedOut = true;
		controller.abort(new RequestTimeoutError(normalizedTimeoutMs));
	};
	const timeout = setTimeout(abortFromTimeout, normalizedTimeoutMs);

	if (parent?.aborted) {
		abortFromParent();
	} else {
		parent?.addEventListener("abort", abortFromParent, { once: true });
	}

	return {
		signal: controller.signal,
		aborted: () => controller.signal.aborted,
		timedOut: () => timedOut,
		dispose: () => {
			clearTimeout(timeout);
			parent?.removeEventListener("abort", abortFromParent);
		},
	};
}

function getAbortError(signal: AbortSignal | undefined): Error {
	const reason = signal?.reason;
	if (reason instanceof Error) {
		return reason;
	}
	return new Error(reason === undefined ? "Provider request aborted" : String(reason));
}

async function waitForProvider<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (!signal) {
		return await promise;
	}
	if (signal.aborted) {
		throw getAbortError(signal);
	}

	return await new Promise<T>((resolve, reject) => {
		const abort = () => {
			signal.removeEventListener("abort", abort);
			reject(getAbortError(signal));
		};
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

async function nextProviderEvent(
	iterator: AsyncIterator<AssistantMessageEvent>,
	signal: AbortSignal | undefined,
): Promise<IteratorResult<AssistantMessageEvent>> {
	if (!signal) {
		return iterator.next();
	}
	if (signal.aborted) {
		throw getAbortError(signal);
	}

	return await new Promise<IteratorResult<AssistantMessageEvent>>((resolve, reject) => {
		const abort = () => {
			signal.removeEventListener("abort", abort);
			reject(getAbortError(signal));
		};
		signal.addEventListener("abort", abort, { once: true });
		iterator.next().then(
			(result) => {
				signal.removeEventListener("abort", abort);
				resolve(result);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(
	initialContext: AgentContext,
	newMessages: AgentMessage[],
	initialConfig: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
	streamFn?: StreamFn,
): Promise<void> {
	let currentContext = initialContext;
	let config = initialConfig;
	const maxTurns = normalizeMaxTurns(initialConfig.maxTurns);
	let assistantTurns = 0;
	const loopDetectionOptions = normalizeLoopDetectionOptions(initialConfig.loopDetection);
	const loopDetector = loopDetectionOptions ? new LoopDetector(loopDetectionOptions) : undefined;
	let firstTurn = true;
	// Check for steering messages at start (user may have typed while waiting)
	let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];

	// Outer loop: continues when queued follow-up messages arrive after agent would stop
	while (true) {
		let hasMoreToolCalls = true;

		// Inner loop: process tool calls and steering messages
		while (hasMoreToolCalls || pendingMessages.length > 0) {
			if (maxTurns !== undefined && assistantTurns >= maxTurns) {
				await emit({ type: "max_turns_reached", turns: assistantTurns, maxTurns });
				await emit({ type: "agent_end", messages: newMessages });
				return;
			}

			if (!firstTurn) {
				await emit({ type: "turn_start" });
			} else {
				firstTurn = false;
			}

			// Process pending messages (inject before next assistant response)
			if (pendingMessages.length > 0) {
				for (const message of pendingMessages) {
					await emit({ type: "message_start", message });
					await emit({ type: "message_end", message });
					currentContext.messages.push(message);
					newMessages.push(message);
				}
				pendingMessages = [];
			}

			// Stream assistant response
			const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFn);
			assistantTurns += 1;
			newMessages.push(message);

			if (message.stopReason === "error" || message.stopReason === "aborted") {
				await emit({ type: "turn_end", message, toolResults: [] });
				await emit({ type: "agent_end", messages: newMessages });
				return;
			}

			// Check for tool calls
			const toolCalls = message.content.filter((c) => c.type === "toolCall");

			const toolResults: ToolResultMessage[] = [];
			hasMoreToolCalls = false;
			if (toolCalls.length > 0) {
				const executedToolBatch = await executeToolCalls(currentContext, message, config, signal, emit);
				toolResults.push(...executedToolBatch.messages);
				hasMoreToolCalls = !executedToolBatch.terminate;

				for (const result of toolResults) {
					currentContext.messages.push(result);
					newMessages.push(result);
				}
			}

			await emit({ type: "turn_end", message, toolResults });

			const loopResult = loopDetector?.record({ message, toolResults, newMessages });
			if (loopResult) {
				await emit({ type: "loop_detected", result: loopResult });
				if (loopResult.action === "stop") {
					await emit({ type: "agent_end", messages: newMessages });
					return;
				}
			}

			const nextTurnContext = {
				message,
				toolResults,
				context: currentContext,
				newMessages,
			};
			const nextTurnSnapshot = await config.prepareNextTurn?.(nextTurnContext);
			if (nextTurnSnapshot) {
				currentContext = nextTurnSnapshot.context ?? currentContext;
				config = {
					...config,
					model: nextTurnSnapshot.model ?? config.model,
					reasoning:
						nextTurnSnapshot.thinkingLevel === undefined
							? config.reasoning
							: nextTurnSnapshot.thinkingLevel === "off"
								? undefined
								: nextTurnSnapshot.thinkingLevel,
				};
			}

			if (
				await config.shouldStopAfterTurn?.({
					message,
					toolResults,
					context: currentContext,
					newMessages,
				})
			) {
				await emit({ type: "agent_end", messages: newMessages });
				return;
			}

			pendingMessages = (await config.getSteeringMessages?.()) || [];
		}

		// Agent would stop here. Check for follow-up messages.
		const followUpMessages = (await config.getFollowUpMessages?.()) || [];
		if (followUpMessages.length > 0) {
			// Set as pending so inner loop processes them
			pendingMessages = followUpMessages;
			continue;
		}

		// No more messages, exit
		break;
	}

	await emit({ type: "agent_end", messages: newMessages });
}

/**
 * Stream an assistant response from the LLM.
 * This is where AgentMessage[] gets transformed to Message[] for the LLM.
 */
async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
	streamFn?: StreamFn,
): Promise<AssistantMessage> {
	// Apply context transform if configured (AgentMessage[] → AgentMessage[])
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (AgentMessage[] → Message[])
	const llmMessages = await config.convertToLlm(messages);

	// Build LLM context
	const llmContext: Context = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools.slice(),
	};

	const streamFunction = streamFn || stream;
	const now = getNow(config);
	const requestSequence = nextProviderRequestSequence();
	const startedAt = now();
	const requestId = (config.createRequestId ?? defaultRequestId)(requestSequence, startedAt);
	const observerBase = { requestId, requestSequence, model: config.model, context: llmContext, startedAt };
	const requestSignal = createProviderRequestSignal(signal, config.requestTimeoutMs);
	await observeProviderRequest(() => config.providerRequestObserver?.onRequestStart?.(observerBase));

	let observedCompletion = false;
	const observeCompletion = async (message: AssistantMessage | undefined, error?: unknown) => {
		if (observedCompletion) return;
		observedCompletion = true;
		const completedAt = now();
		const span = createTraceSpan(
			"request",
			requestId,
			"request",
			startedAt,
			completedAt,
			getRequestStatus(requestSignal, message, error),
		);
		await observeProviderRequest(() =>
			config.providerRequestObserver?.onRequestComplete?.({
				...observerBase,
				completedAt,
				durationMs: completedAt - startedAt,
				message,
				error,
				aborted: requestSignal.aborted() || message?.stopReason === "aborted",
				span,
			}),
		);
		await emit({
			type: "runtime_trace",
			trace: {
				type: "trace",
				name: "request",
				timestamp: completedAt,
				details: {
					requestId,
					requestSequence,
					model: config.model.id,
					provider: config.model.provider,
					status: span.status,
				},
				span,
			},
		});
	};

	// Resolve API key (important for expiring tokens)
	const resolvedApiKey =
		(config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

	let response: Awaited<ReturnType<StreamFn>>;
	try {
		response = await waitForProvider(
			Promise.resolve(
				streamFunction(config.model, llmContext, {
					...config,
					apiKey: resolvedApiKey,
					signal: requestSignal.signal,
					onPayload: async (payload, model) => {
						const nextPayload = await config.onPayload?.(payload, model);
						const finalPayload = nextPayload === undefined ? payload : nextPayload;
						await observeProviderRequest(() =>
							config.providerRequestObserver?.onRequestPayload?.({ ...observerBase, payload: finalPayload }),
						);
						return nextPayload;
					},
					onResponse: async (providerResponse, model) => {
						await config.onResponse?.(providerResponse, model);
						await observeProviderRequest(() =>
							config.providerRequestObserver?.onRequestResponse?.({
								...observerBase,
								response: providerResponse,
							}),
						);
					},
				}),
			),
			requestSignal.signal,
		);
	} catch (error) {
		requestSignal.dispose();
		await observeCompletion(undefined, error);
		throw error;
	}

	let partialMessage: AssistantMessage | null = null;
	let addedPartial = false;

	try {
		const iterator = response[Symbol.asyncIterator]();
		while (true) {
			const nextEvent = await nextProviderEvent(iterator, requestSignal.signal);
			if (nextEvent.done) {
				break;
			}
			const event = nextEvent.value;
			switch (event.type) {
				case "start":
					partialMessage = event.partial;
					context.messages.push(partialMessage);
					addedPartial = true;
					await emit({ type: "message_start", message: { ...partialMessage } });
					break;

				case "text_start":
				case "text_delta":
				case "text_end":
				case "thinking_start":
				case "thinking_delta":
				case "thinking_end":
				case "toolcall_start":
				case "toolcall_delta":
				case "toolcall_end":
					if (partialMessage) {
						partialMessage = event.partial;
						context.messages[context.messages.length - 1] = partialMessage;
						await emit({
							type: "message_update",
							assistantMessageEvent: event,
							message: { ...partialMessage },
						});
					}
					break;

				case "done":
				case "error": {
					const finalMessage = await waitForProvider(response.result(), requestSignal.signal);
					await observeCompletion(finalMessage);
					if (addedPartial) {
						context.messages[context.messages.length - 1] = finalMessage;
					} else {
						context.messages.push(finalMessage);
					}
					if (!addedPartial) {
						await emit({ type: "message_start", message: { ...finalMessage } });
					}
					await emit({ type: "message_end", message: finalMessage });
					return finalMessage;
				}
			}
		}

		const finalMessage = await waitForProvider(response.result(), requestSignal.signal);
		await observeCompletion(finalMessage);
		if (addedPartial) {
			context.messages[context.messages.length - 1] = finalMessage;
		} else {
			context.messages.push(finalMessage);
			await emit({ type: "message_start", message: { ...finalMessage } });
		}
		await emit({ type: "message_end", message: finalMessage });
		return finalMessage;
	} catch (error) {
		await observeCompletion(undefined, error);
		throw error;
	} finally {
		requestSignal.dispose();
	}
}

/**
 * Execute tool calls from an assistant message.
 */
async function executeToolCalls(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
): Promise<ExecutedToolCallBatch> {
	const toolCalls = assistantMessage.content.filter((c) => c.type === "toolCall");
	const hasSequentialToolCall = toolCalls.some(
		(tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential",
	);
	if (config.toolExecution === "sequential" || hasSequentialToolCall) {
		return executeToolCallsSequential(currentContext, assistantMessage, toolCalls, config, signal, emit);
	}
	return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit);
}

type ExecutedToolCallBatch = {
	messages: ToolResultMessage[];
	terminate: boolean;
};

async function executeToolCallsSequential(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCalls: ToolCall[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
): Promise<ExecutedToolCallBatch> {
	const finalizedCalls: FinalizedToolCallOutcome[] = [];
	const messages: ToolResultMessage[] = [];

	for (const toolCall of toolCalls) {
		await emit({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});

		const preparation = await prepareToolCall(currentContext, assistantMessage, toolCall, config, signal);
		let finalized: FinalizedToolCallOutcome;
		if (preparation.kind === "immediate") {
			finalized = limitFinalizedToolCall(
				{
					toolCall,
					result: preparation.result,
					isError: preparation.isError,
					meta: createToolExecutionMeta(
						preparation.status,
						createTraceSpan(
							"tool",
							toolCall.id,
							toolCall.name,
							preparation.startedAt,
							preparation.startedAt,
							mapToolStatus(preparation.status),
						),
					),
					startedAt: preparation.startedAt,
				},
				config,
			);
		} else {
			const executed = await executePreparedToolCall(preparation, config, signal, emit);
			finalized = await finalizeExecutedToolCall(
				currentContext,
				assistantMessage,
				preparation,
				executed,
				config,
				signal,
			);
			finalized = limitFinalizedToolCall(finalized, config, preparation.tool);
		}

		await emitToolExecutionEnd(finalized, emit);
		const toolResultMessage = createToolResultMessage(finalized, config);
		await emitToolResultMessage(toolResultMessage, emit);
		finalizedCalls.push(finalized);
		messages.push(toolResultMessage);

		if (signal?.aborted) {
			break;
		}
	}

	return {
		messages,
		terminate: shouldTerminateToolBatch(finalizedCalls),
	};
}

async function executeToolCallsParallel(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCalls: ToolCall[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
): Promise<ExecutedToolCallBatch> {
	const finalizedCalls: FinalizedToolCallEntry[] = [];

	for (const toolCall of toolCalls) {
		await emit({
			type: "tool_execution_start",
			toolCallId: toolCall.id,
			toolName: toolCall.name,
			args: toolCall.arguments,
		});

		const preparation = await prepareToolCall(currentContext, assistantMessage, toolCall, config, signal);
		if (preparation.kind === "immediate") {
			const finalized = limitFinalizedToolCall(
				{
					toolCall,
					result: preparation.result,
					isError: preparation.isError,
					meta: createToolExecutionMeta(
						preparation.status,
						createTraceSpan(
							"tool",
							toolCall.id,
							toolCall.name,
							preparation.startedAt,
							preparation.startedAt,
							mapToolStatus(preparation.status),
						),
					),
					startedAt: preparation.startedAt,
				},
				config,
			);
			await emitToolExecutionEnd(finalized, emit);
			finalizedCalls.push(finalized);
			if (signal?.aborted) {
				break;
			}
			continue;
		}

		finalizedCalls.push(async () => {
			const executed = await executePreparedToolCall(preparation, config, signal, emit);
			const finalized = await finalizeExecutedToolCall(
				currentContext,
				assistantMessage,
				preparation,
				executed,
				config,
				signal,
			);
			const limited = limitFinalizedToolCall(finalized, config, preparation.tool);
			await emitToolExecutionEnd(limited, emit);
			return limited;
		});
		if (signal?.aborted) {
			break;
		}
	}

	const maxConcurrency = normalizeMaxToolConcurrency(config.maxToolConcurrency);
	const orderedFinalizedCalls = await runFinalizers(finalizedCalls, maxConcurrency);
	const messages: ToolResultMessage[] = [];
	for (const finalized of orderedFinalizedCalls) {
		const toolResultMessage = createToolResultMessage(finalized, config);
		await emitToolResultMessage(toolResultMessage, emit);
		messages.push(toolResultMessage);
	}

	return {
		messages,
		terminate: shouldTerminateToolBatch(orderedFinalizedCalls),
	};
}

async function runFinalizers(
	entries: FinalizedToolCallEntry[],
	maxConcurrency: number | undefined,
): Promise<FinalizedToolCallOutcome[]> {
	const outcomes: FinalizedToolCallOutcome[] = new Array(entries.length);
	let nextIndex = 0;
	const workerCount = Math.min(maxConcurrency ?? entries.length, entries.length);

	const runNext = async (): Promise<void> => {
		while (nextIndex < entries.length) {
			const index = nextIndex;
			nextIndex += 1;
			const entry = entries[index];
			outcomes[index] = typeof entry === "function" ? await entry() : entry;
		}
	};

	await Promise.all(Array.from({ length: workerCount }, runNext));
	return outcomes;
}

type PreparedToolCall = {
	kind: "prepared";
	toolCall: ToolCall;
	tool: Tool<any>;
	args: unknown;
	startedAt: number;
};

type ImmediateToolCallOutcome = {
	kind: "immediate";
	result: ToolResult<any>;
	isError: boolean;
	status: ToolExecutionStatus;
	startedAt: number;
};

type ExecutedToolCallOutcome = {
	result: ToolResult<any>;
	isError: boolean;
	status: ToolExecutionStatus;
};

type FinalizedToolCallOutcome = {
	toolCall: ToolCall;
	result: ToolResult<any>;
	isError: boolean;
	meta: ToolExecutionMeta;
	startedAt: number;
};

type FinalizedToolCallEntry = FinalizedToolCallOutcome | (() => Promise<FinalizedToolCallOutcome>);

function shouldTerminateToolBatch(finalizedCalls: FinalizedToolCallOutcome[]): boolean {
	return finalizedCalls.length > 0 && finalizedCalls.every((finalized) => finalized.result.terminate === true);
}

function prepareToolCallArguments(tool: Tool<any>, toolCall: ToolCall): ToolCall {
	if (!tool.prepareArguments) {
		return toolCall;
	}
	const preparedArguments = tool.prepareArguments(toolCall.arguments);
	if (preparedArguments === toolCall.arguments) {
		return toolCall;
	}
	return {
		...toolCall,
		arguments: preparedArguments as Record<string, any>,
	};
}

async function prepareToolCall(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	toolCall: ToolCall,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
): Promise<PreparedToolCall | ImmediateToolCallOutcome> {
	const startedAt = getNow(config)();
	const tool = currentContext.tools?.find((t) => t.name === toolCall.name);
	if (!tool) {
		return {
			kind: "immediate",
			result: createErrorToolResult(`Tool ${toolCall.name} not found`),
			isError: true,
			status: "blocked",
			startedAt,
		};
	}

	try {
		const preparedToolCall = prepareToolCallArguments(tool, toolCall);
		const validatedArgs = validateToolArguments(tool, preparedToolCall);
		if (config.beforeToolCall) {
			const beforeResult = await config.beforeToolCall(
				{
					assistantMessage,
					toolCall,
					args: validatedArgs,
					context: currentContext,
				},
				signal,
			);
			if (signal?.aborted) {
				return {
					kind: "immediate",
					result: createErrorToolResult("Operation aborted"),
					isError: true,
					status: "aborted",
					startedAt,
				};
			}
			if (beforeResult?.block) {
				return {
					kind: "immediate",
					result: createErrorToolResult(beforeResult.reason || "Tool execution was blocked"),
					isError: true,
					status: "blocked",
					startedAt,
				};
			}
		}
		if (signal?.aborted) {
			return {
				kind: "immediate",
				result: createErrorToolResult("Operation aborted"),
				isError: true,
				status: "aborted",
				startedAt,
			};
		}
		return {
			kind: "prepared",
			toolCall,
			tool,
			args: validatedArgs,
			startedAt,
		};
	} catch (error) {
		return {
			kind: "immediate",
			result: createErrorToolResult(error instanceof Error ? error.message : String(error)),
			isError: true,
			status: "failed",
			startedAt,
		};
	}
}

async function executePreparedToolCall(
	prepared: PreparedToolCall,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
): Promise<ExecutedToolCallOutcome> {
	const updateEvents: Promise<void>[] = [];
	let acceptingUpdates = true;

	try {
		const result = await prepared.tool.execute(
			prepared.toolCall.id,
			prepared.args as never,
			signal,
			(partialResult) => {
				if (!acceptingUpdates) return;
				const limitedResult = limitToolResult(partialResult, config, prepared.tool);
				updateEvents.push(
					Promise.resolve(
						emit({
							type: "tool_execution_update",
							toolCallId: prepared.toolCall.id,
							toolName: prepared.toolCall.name,
							args: prepared.toolCall.arguments,
							partialResult: limitedResult,
						}),
					),
				);
			},
		);
		acceptingUpdates = false;
		await Promise.all(updateEvents);
		return { result, isError: false, status: signal?.aborted ? "aborted" : "completed" };
	} catch (error) {
		acceptingUpdates = false;
		await Promise.all(updateEvents);
		return {
			result: createErrorToolResult(error instanceof Error ? error.message : String(error)),
			isError: true,
			status: signal?.aborted ? "aborted" : "failed",
		};
	} finally {
		acceptingUpdates = false;
	}
}

async function finalizeExecutedToolCall(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	prepared: PreparedToolCall,
	executed: ExecutedToolCallOutcome,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
): Promise<FinalizedToolCallOutcome> {
	let result = executed.result;
	let isError = executed.isError;
	let status = executed.status;

	if (config.afterToolCall) {
		try {
			const afterResult = await config.afterToolCall(
				{
					assistantMessage,
					toolCall: prepared.toolCall,
					args: prepared.args,
					result,
					isError,
					context: currentContext,
				},
				signal,
			);
			if (afterResult) {
				result = {
					content: afterResult.content ?? result.content,
					details: afterResult.details ?? result.details,
					terminate: afterResult.terminate ?? result.terminate,
				};
				isError = afterResult.isError ?? isError;
				if (isError && status === "completed") {
					status = "failed";
				}
			}
		} catch (error) {
			result = createErrorToolResult(error instanceof Error ? error.message : String(error));
			isError = true;
			status = signal?.aborted ? "aborted" : "failed";
		}
	}

	const validationError = validateToolDetails(result, prepared.tool);
	if (validationError) {
		result = createErrorToolResult(`Tool ${prepared.tool.name} returned invalid details: ${validationError}`);
		isError = true;
		status = "failed";
	}

	const endedAt = getNow(config)();
	const span = createTraceSpan(
		"tool",
		prepared.toolCall.id,
		prepared.toolCall.name,
		prepared.startedAt,
		endedAt,
		mapToolStatus(status),
	);
	return {
		toolCall: prepared.toolCall,
		result,
		isError,
		meta: createToolExecutionMeta(status, span),
		startedAt: prepared.startedAt,
	};
}

function validateToolDetails(result: ToolResult<any>, tool: Tool<any>): string | undefined {
	if (!tool.detailsSchema) {
		return undefined;
	}

	let validator = detailsValidatorCache.get(tool.detailsSchema);
	if (!validator) {
		validator = Compile(tool.detailsSchema);
		detailsValidatorCache.set(tool.detailsSchema, validator);
	}

	if (validator.Check(result.details)) {
		return undefined;
	}

	const issues = Array.from(validator.Errors(result.details)).map((issue) => issue.message);
	return issues.length > 0 ? issues.join("; ") : "Tool result details failed validation";
}

function limitFinalizedToolCall(
	finalized: FinalizedToolCallOutcome,
	config: AgentLoopConfig,
	tool?: Tool<any>,
): FinalizedToolCallOutcome {
	const maxChars = getToolOutputLimit(config, tool);
	if (maxChars === undefined) {
		return finalized;
	}

	const output = limitToolOutput(finalized.result.content, { maxChars });
	if (!output.stats.truncated) {
		return finalized;
	}

	return {
		...finalized,
		result: {
			...finalized.result,
			content: output.content,
		},
		meta: {
			...finalized.meta,
			truncated: true,
			originalChars: output.stats.originalChars,
			emittedChars: output.stats.emittedChars,
		},
	};
}

function limitToolResult<T>(result: ToolResult<T>, config: AgentLoopConfig, tool?: Tool<any>): ToolResult<T> {
	const maxChars = getToolOutputLimit(config, tool);
	if (maxChars === undefined) {
		return result;
	}

	const output = limitToolOutput(result.content, { maxChars });
	if (!output.stats.truncated) {
		return result;
	}

	return {
		...result,
		content: output.content,
	};
}

function createTraceSpan(
	kind: "request" | "tool",
	id: string,
	name: string | undefined,
	startedAt: number,
	endedAt: number,
	status: TraceStatus,
): TraceSpan {
	return {
		kind,
		id,
		name,
		startedAt,
		endedAt,
		durationMs: endedAt - startedAt,
		status,
	};
}

function getRequestStatus(
	signal: ProviderRequestSignal,
	message: AssistantMessage | undefined,
	error: unknown,
): "ok" | "error" | "aborted" | "timeout" {
	if (signal.timedOut()) {
		return "timeout";
	}
	if (error) {
		return "error";
	}
	if (signal.aborted() || message?.stopReason === "aborted") {
		return "aborted";
	}
	return "ok";
}

function mapToolStatus(status: ToolExecutionStatus): TraceStatus {
	switch (status) {
		case "completed":
			return "ok";
		case "failed":
			return "error";
		case "blocked":
			return "blocked";
		case "aborted":
			return "aborted";
	}
}

function createToolExecutionMeta(status: ToolExecutionStatus, span: TraceSpan): ToolExecutionMeta {
	return { status, span };
}

function createErrorToolResult(message: string): ToolResult<any> {
	return {
		content: [{ type: "text", text: message }],
		details: {},
	};
}

async function emitToolExecutionEnd(finalized: FinalizedToolCallOutcome, emit: EventSink): Promise<void> {
	await emit({
		type: "tool_execution_end",
		toolCallId: finalized.toolCall.id,
		toolName: finalized.toolCall.name,
		result: finalized.result,
		isError: finalized.isError,
		meta: finalized.meta,
	});
}

function createToolResultMessage(finalized: FinalizedToolCallOutcome, config: AgentLoopConfig): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: finalized.toolCall.id,
		toolName: finalized.toolCall.name,
		content: finalized.result.content,
		details: finalized.result.details,
		isError: finalized.isError,
		timestamp: getNow(config)(),
	};
}

async function emitToolResultMessage(toolResultMessage: ToolResultMessage, emit: EventSink): Promise<void> {
	await emit({ type: "message_start", message: toolResultMessage });
	await emit({ type: "message_end", message: toolResultMessage });
}
