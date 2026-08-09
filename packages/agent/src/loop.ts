import type { ToolResultMessage } from "@tsuuanmi/pi-ai";
import { type LoopDetectionResult, LoopDetector, normalizeLoopDetectionOptions } from "#agent/agent/loop-detector";
import { streamAgentResponse } from "#agent/agent/provider";
import { executeToolCalls } from "#agent/agent/tool-execution";
import type { AgentLoopConfig } from "#agent/config";
import type { Context } from "#agent/context";
import type { EventSink, Warning } from "#agent/events";
import type { AgentMessage } from "#agent/messages/types";
import type { StreamFunction } from "#agent/stream";

export async function runPrompt(
	prompts: AgentMessage[],
	context: Context,
	config: AgentLoopConfig,
	emit: EventSink,
	signal?: AbortSignal,
	stream?: StreamFunction,
): Promise<AgentMessage[]> {
	const newMessages: AgentMessage[] = [...prompts];
	const currentContext: Context = {
		...context,
		messages: [...context.messages, ...prompts],
	};

	await emit({ type: "agent_start" });
	await emit({ type: "turn_start" });
	for (const prompt of prompts) {
		await emit({ type: "message_start", message: prompt });
		await emit({ type: "message_end", message: prompt });
	}

	await runLoop(currentContext, newMessages, config, signal, emit, stream);
	return newMessages;
}

export async function runContinue(
	context: Context,
	config: AgentLoopConfig,
	emit: EventSink,
	signal?: AbortSignal,
	stream?: StreamFunction,
): Promise<AgentMessage[]> {
	if (context.messages.length === 0) {
		throw new Error("Cannot continue: no messages in context");
	}

	if (context.messages[context.messages.length - 1].role === "assistant") {
		throw new Error("Cannot continue from message role: assistant");
	}

	const newMessages: AgentMessage[] = [];
	const currentContext: Context = { ...context };

	await emit({ type: "agent_start" });
	await emit({ type: "turn_start" });

	await runLoop(currentContext, newMessages, config, signal, emit, stream);
	return newMessages;
}

function normalizeMaxTurns(maxTurns: number | undefined): number | undefined {
	if (maxTurns === undefined || !Number.isFinite(maxTurns)) {
		return undefined;
	}
	return Math.max(1, Math.floor(maxTurns));
}

function createLoopWarning(result: LoopDetectionResult): Warning {
	return {
		code: "LOOP_DETECTED",
		message: result.reason,
		details: { result },
	};
}

function createMaxTurnsWarning(turns: number, maxTurns: number): Warning {
	return {
		code: "MAX_TURNS_REACHED",
		message: `Maximum agent turns reached: ${turns}/${maxTurns}`,
		details: { turns, maxTurns },
	};
}

async function runLoop(
	initialContext: Context,
	newMessages: AgentMessage[],
	initialConfig: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: EventSink,
	stream?: StreamFunction,
): Promise<void> {
	let currentContext = initialContext;
	let config = initialConfig;
	const maxTurns = normalizeMaxTurns(initialConfig.maxTurns);
	let agentTurns = 0;
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
			if (maxTurns !== undefined && agentTurns >= maxTurns) {
				await emit({ type: "warning", warning: createMaxTurnsWarning(agentTurns, maxTurns) });
				await emit({ type: "max_turns_reached", turns: agentTurns, maxTurns });
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
			const message = await streamAgentResponse(currentContext, config, signal, emit, stream);
			agentTurns += 1;
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
				await emit({ type: "warning", warning: createLoopWarning(loopResult) });
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
