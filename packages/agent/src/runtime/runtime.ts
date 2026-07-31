import { stream } from "@tsuuanmi/pi-ai";
import type { AgentMessage, AgentTraceEvent } from "#agent/messages/state";
import type { AgentLoopConfig, StreamFn } from "#agent/runtime/config";
import type { AgentEvent } from "#agent/runtime/events";
import { runAgentLoop, runAgentLoopContinue } from "#agent/runtime/loop";
import type { AgentContext } from "#agent/tool/types";

/** Receives events emitted by an agent backend or runtime. */
export type EventSink = (event: AgentEvent) => Promise<void> | void;

/** Shared request fields used by all agent backend executions. */
export interface RuntimeRequest {
	/** Snapshot of the transcript, tools, and system prompt visible to the backend. */
	context: AgentContext;
	/** Runtime loop/provider/tool configuration for this invocation. */
	config: AgentLoopConfig;
	/** Lifecycle/event sink owned by the Agent facade. */
	emit: EventSink;
	/** Abort signal scoped to the current invocation. */
	signal: AbortSignal;
	/** Optional stream implementation override for LLM-backed runtimes. */
	streamFn?: StreamFn;
}

/** Request for starting a backend from newly supplied prompt messages. */
export interface PromptRequest extends RuntimeRequest {
	kind: "prompt";
	/** Messages to append before the backend starts. */
	messages: AgentMessage[];
}

/** Request for continuing from the transcript already present in context. */
export interface ContinueRequest extends RuntimeRequest {
	kind: "continue";
}

/** Unified runtime request accepted by the runtime stream seam. */
export type RunRequest = PromptRequest | ContinueRequest;

export type RunStatus = "completed" | "aborted" | "failed";

export interface ProcessInfo {
	pid?: number;
	command?: string;
	args?: readonly string[];
	cwd?: string;
	exitCode?: number | null;
	signal?: string | null;
}

export interface ProtocolInfo {
	name: string;
	version?: string;
	sessionId?: string;
	stopReason?: string;
}

export interface RuntimeBackend {
	kind: "llm" | "process" | "protocol" | "custom";
	name: string;
	modelId?: string;
	provider?: string;
	process?: ProcessInfo;
	protocol?: ProtocolInfo;
	details?: Record<string, unknown>;
}

export interface ToolCallSummary {
	id: string;
	name: string;
	isError: boolean;
}

export interface RuntimeWarning {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

export type RuntimeTrace = AgentTraceEvent;

/** Aggregated result returned by every runtime invocation. */
export interface RunResult {
	/** Messages produced by this invocation. */
	messages: AgentMessage[];
	/** Final assistant text output, when available. */
	output: string;
	/** Assistant turns produced by this invocation. */
	turns: number;
	/** Backend identity and backend-specific metadata for this invocation. */
	backend: RuntimeBackend;
	/** Tool calls completed during this invocation. */
	toolCalls: ToolCallSummary[];
	/** Runtime warnings produced during this invocation. */
	warnings: RuntimeWarning[];
	/** Trace events produced during this invocation. */
	traces: RuntimeTrace[];
	/** True when runtime loop detection fired. */
	loopDetected: boolean;
	/** True when the runtime stopped because maxTurns was reached. */
	maxTurnsReached: boolean;
	/** Coarse completion status for host backends. */
	status: RunStatus;
	/** Invocation start timestamp in milliseconds since epoch. */
	startedAt: number;
	/** Invocation completion timestamp in milliseconds since epoch. */
	completedAt: number;
	/** Invocation duration in milliseconds. */
	durationMs: number;
	/** Optional backend error detail for failed invocations. */
	error?: unknown;
}

export type RuntimeEvent =
	| { type: "event"; event: AgentEvent }
	| { type: "backend"; backend: RuntimeBackend }
	| { type: "warning"; warning: RuntimeWarning }
	| { type: "trace"; trace: RuntimeTrace }
	| { type: "done"; result: RunResult }
	| { type: "error"; error: unknown };

/**
 * Runtime execution backend for an Agent.
 *
 * Implementations own how agent turns are produced. The default backend uses
 * the standard agent protocol/runtime loop, while Node-only packages can provide
 * process or protocol-backed implementations through `@tsuuanmi/pi-agent/node`.
 */
export interface AgentBackend {
	/** Stream runtime events and finish with one done or error event. */
	stream(request: RunRequest): AsyncIterable<RuntimeEvent>;
	dispose?(): Promise<void> | void;
}

/** Standard LLM/tool-loop runtime interface. */
export interface AgentRuntime extends AgentBackend {}

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
		const queue: RuntimeEvent[] = [];
		let finished = false;
		let wake: (() => void) | undefined;

		const notify = () => {
			wake?.();
			wake = undefined;
		};
		const push = (event: RuntimeEvent) => {
			queue.push(event);
			notify();
		};
		const waitForEvent = () =>
			new Promise<void>((resolve) => {
				wake = resolve;
			});
		const forwardedEmit = async (event: AgentEvent) => {
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
			push({ type: "event", event });
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
			const event = queue.shift();
			if (event) {
				yield event;
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

function getRunStatus(message: { stopReason?: string } | undefined): RunStatus {
	if (message?.stopReason === "aborted") {
		return "aborted";
	}
	if (message?.stopReason === "error") {
		return "failed";
	}
	return "completed";
}
