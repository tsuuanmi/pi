import {
	type AssistantMessage,
	type AssistantMessageEvent,
	stream as defaultStream,
	type Context as LlmContext,
} from "@tsuuanmi/pi-ai";
import { createTraceSpan, getNow } from "#agent/agent/trace";
import type { AgentLoopConfig } from "#agent/config";
import type { Context } from "#agent/context";
import type { EventSink } from "#agent/events";
import type { StreamFunction } from "#agent/stream";

let providerRequestSequence = 0;

function nextProviderRequestSequence(): number {
	providerRequestSequence += 1;
	return providerRequestSequence;
}

function defaultRequestId(sequence: number, startedAt: number): string {
	return `llm_${startedAt.toString(36)}_${sequence.toString(36)}`;
}

async function observeProviderRequest(callback: (() => void | Promise<void>) | undefined): Promise<void> {
	if (!callback) return;
	try {
		await callback();
	} catch {
		// Provider request observers are best-effort and must not affect agent runs.
	}
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
 * Main loop logic shared by prompt and continuation runs.
 */
export async function streamAgentResponse(
	context: Context,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
	stream?: StreamFunction,
): Promise<AssistantMessage> {
	// Apply context transform if configured (Message[] → Message[])
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (Message[] → Message[])
	const llmMessages = await config.convertToLlm(messages);

	// Build LLM context
	const llmContext: LlmContext = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools.slice(),
	};

	const requestStream = stream ?? defaultStream;
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
			type: "trace",
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

	let response: Awaited<ReturnType<StreamFunction>>;
	try {
		response = await waitForProvider(
			Promise.resolve(
				requestStream(config.model, llmContext, {
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
