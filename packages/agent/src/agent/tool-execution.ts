import { type AssistantMessage, type ToolResultMessage, validateToolArguments } from "@tsuuanmi/pi-ai";
import { Compile } from "typebox/compile";
import { createTraceSpan, getNow } from "#agent/agent/trace";
import type { AgentLoopConfig } from "#agent/config";
import type { Context } from "#agent/context";
import type { EventSink, ToolExecutionMeta, ToolExecutionStatus } from "#agent/events";
import type { TraceSpan, TraceStatus } from "#agent/messages/state";
import { limitToolOutput, normalizeToolOutputLimit } from "#agent/tool/output";
import type { ToolResult } from "#agent/tool/result";
import type { Tool } from "#agent/tool/tool";
import type { ToolCall } from "#agent/tool-call";

const detailsValidatorCache = new WeakMap<object, ReturnType<typeof Compile>>();

function normalizeMaxToolConcurrency(maxToolConcurrency: number | undefined): number | undefined {
	if (maxToolConcurrency === undefined || !Number.isFinite(maxToolConcurrency)) {
		return undefined;
	}
	return Math.max(1, Math.floor(maxToolConcurrency));
}

function getToolOutputLimit(config: AgentLoopConfig, tool: Tool<any> | undefined): number | undefined {
	return normalizeToolOutputLimit(tool?.maxOutputChars ?? config.maxToolOutputChars);
}

export async function executeToolCalls(
	currentContext: Context,
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
	currentContext: Context,
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
	currentContext: Context,
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
	currentContext: Context,
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
	currentContext: Context,
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
