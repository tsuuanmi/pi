import { stream } from "@tsuuanmi/pi-ai";
import type { RuntimeBackend } from "#agent/backend";
import type { StreamFn } from "#agent/config";
import type { AgentEvent, RuntimeEvent, RuntimeTrace, RuntimeWarning } from "#agent/events";
import { runAgentLoop, runAgentLoopContinue } from "#agent/loop";
import type { AgentMessage } from "#agent/messages/state";
import type { RunRequest, RunResult, ToolCallSummary } from "#agent/run";
import type { AgentRuntime } from "#agent/runtime";

/** Default AgentRuntime backed by the package's low-level standard runtime loop. */
export class DefaultAgentRuntime implements AgentRuntime {
	private readonly defaultStreamFn: StreamFn;

	constructor(streamFn: StreamFn = stream) {
		this.defaultStreamFn = streamFn;
	}

	async *stream(request: RunRequest): AsyncIterable<RuntimeEvent> {
		const now = request.config.now ?? Date.now;
		const startedAt = now();
		const backend = createDefaultBackendInfo(request);
		const toolCalls: ToolCallSummary[] = [];
		const warnings: RuntimeWarning[] = [];
		const traces: RuntimeTrace[] = [];
		let loopDetected = false;
		let maxTurnsReached = false;
		const queue: Array<{ event: RuntimeEvent; acknowledge?: () => void }> = [];
		let finished = false;
		let wake: (() => void) | undefined;

		const notify = () => {
			wake?.();
			wake = undefined;
		};
		const push = (event: RuntimeEvent, acknowledge?: () => void) => {
			queue.push({ event, acknowledge });
			notify();
		};
		const waitForEvent = () =>
			new Promise<void>((resolve) => {
				wake = resolve;
			});
		const forwardedEmit = (event: AgentEvent): Promise<void> => {
			if (event.type === "tool_execution_end") {
				toolCalls.push({ id: event.toolCallId, name: event.toolName, isError: event.isError });
			} else if (event.type === "loop_detected") {
				loopDetected = true;
				const warning = createLoopWarning(event);
				warnings.push(warning);
				push({ type: "warning", warning });
			} else if (event.type === "max_turns_reached") {
				maxTurnsReached = true;
				const warning = createMaxTurnsWarning(event);
				warnings.push(warning);
				push({ type: "warning", warning });
			} else if (event.type === "agent_status" && event.trace) {
				traces.push(event.trace);
				push({ type: "trace", trace: event.trace });
			}

			return new Promise<void>((resolve) => {
				push({ type: "event", event }, resolve);
			});
		};

		push({ type: "backend", backend });

		void (async () => {
			try {
				const messages =
					request.kind === "prompt"
						? await runAgentLoop(
								request.messages,
								request.context,
								request.config,
								forwardedEmit,
								request.signal,
								request.streamFn ?? this.defaultStreamFn,
							)
						: await runAgentLoopContinue(
								request.context,
								request.config,
								forwardedEmit,
								request.signal,
								request.streamFn ?? this.defaultStreamFn,
							);

				push({
					type: "done",
					result: createRunResult(
						messages,
						toolCalls,
						warnings,
						traces,
						loopDetected,
						maxTurnsReached,
						backend,
						startedAt,
						now,
					),
				});
			} catch (error) {
				push({ type: "error", error });
			} finally {
				finished = true;
				notify();
			}
		})();

		while (!finished || queue.length > 0) {
			const queuedEvent = queue.shift();
			if (queuedEvent) {
				yield queuedEvent.event;
				queuedEvent.acknowledge?.();
				continue;
			}
			await waitForEvent();
		}
	}

	async dispose(): Promise<void> {}
}

function createRunResult(
	messages: AgentMessage[],
	toolCalls: ToolCallSummary[],
	warnings: RuntimeWarning[],
	traces: RuntimeTrace[],
	loopDetected: boolean,
	maxTurnsReached: boolean,
	backend: RuntimeBackend,
	startedAt: number,
	now: () => number,
): RunResult {
	const assistantMessages = messages.filter(isAssistantMessage);
	const lastAssistant = assistantMessages.at(-1);
	const completedAt = now();
	return {
		messages,
		output: lastAssistant ? getAssistantText(lastAssistant) : "",
		turns: assistantMessages.length,
		backend,
		toolCalls,
		warnings,
		traces,
		loopDetected,
		maxTurnsReached,
		status: getRunStatus(lastAssistant),
		startedAt,
		completedAt,
		durationMs: completedAt - startedAt,
	};
}

function createDefaultBackendInfo(request: RunRequest): RuntimeBackend {
	return {
		kind: "llm",
		name: "default-agent-runtime",
		modelId: request.config.model.id,
		provider: request.config.model.provider,
		details: { transport: request.config.transport, requestKind: request.kind },
	};
}

function createLoopWarning(event: Extract<AgentEvent, { type: "loop_detected" }>): RuntimeWarning {
	return {
		code: "LOOP_DETECTED",
		message: event.result.reason,
		details: { result: event.result },
	};
}

function createMaxTurnsWarning(event: Extract<AgentEvent, { type: "max_turns_reached" }>): RuntimeWarning {
	return {
		code: "MAX_TURNS_REACHED",
		message: `Maximum agent turns reached: ${event.turns}/${event.maxTurns}`,
		details: { turns: event.turns, maxTurns: event.maxTurns },
	};
}

function isAssistantMessage(message: AgentMessage): message is AgentMessage & {
	role: "assistant";
	content: readonly { type: string; text?: string }[];
	stopReason?: string;
} {
	return message.role === "assistant" && Array.isArray(message.content);
}

function getAssistantText(message: { content: readonly { type: string; text?: string }[] }): string {
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text ?? "")
		.join("\n");
}

function getRunStatus(message: { stopReason?: string } | undefined): RunResult["status"] {
	if (message?.stopReason === "aborted") {
		return "aborted";
	}
	if (message?.stopReason === "error") {
		return "failed";
	}
	return "completed";
}
