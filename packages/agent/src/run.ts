import type { RuntimeBackend } from "#agent/backend";
import type { AgentLoopConfig, StreamFn } from "#agent/config";
import type { AgentContext } from "#agent/context";
import type { EventSink, RuntimeTrace, RuntimeWarning } from "#agent/events";
import type { AgentMessage } from "#agent/messages/state";

export interface AgentRunOptions {
	signal?: AbortSignal;
	metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
	success: boolean;
	output: string;
	structured?: unknown;
	error?: unknown;
}

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

export interface ToolCallSummary {
	id: string;
	name: string;
	isError: boolean;
}

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
