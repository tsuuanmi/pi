import { stream } from "@tsuuanmi/pi-ai";
import { runAgentLoop, runAgentLoopContinue } from "#agent/agent/runtime/loop";
import type { AgentEvent } from "#agent/agent/runtime/events";
import type { AgentLoopConfig, StreamFn } from "#agent/agent/runtime/config";
import type { AgentMessage } from "#agent/agent/state/state";
import type { AgentContext } from "#agent/agent/state/tool";

/** Receives events emitted by an agent backend or runtime. */
export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

/** Shared request fields used by all agent backend executions. */
export interface AgentBackendRunRequest {
	/** Snapshot of the transcript, tools, and system prompt visible to the backend. */
	context: AgentContext;
	/** Runtime loop/provider/tool configuration for this invocation. */
	config: AgentLoopConfig;
	/** Lifecycle/event sink owned by the Agent wrapper. */
	emit: AgentEventSink;
	/** Abort signal scoped to the current invocation. */
	signal: AbortSignal;
	/** Optional stream implementation override for LLM-backed runtimes. */
	streamFn?: StreamFn;
}

/** Request for starting a backend from newly supplied prompt messages. */
export interface AgentPromptRunRequest extends AgentBackendRunRequest {
	/** Messages to append before the backend starts. */
	messages: AgentMessage[];
}

/** Request for continuing from the transcript already present in context. */
export interface AgentContinuationRunRequest extends AgentBackendRunRequest {}

/**
 * Runtime execution backend for an Agent.
 *
 * Implementations own how agent turns are produced. The default backend uses
 * the built-in LLM/tool loop, while Node-only packages can provide process or
 * protocol-backed implementations through `@tsuuanmi/pi-agent/node`.
 */
export interface AgentBackend {
	runPrompt(request: AgentPromptRunRequest): Promise<void>;
	continue(request: AgentContinuationRunRequest): Promise<void>;
}

/** Standard LLM/tool-loop runtime interface. */
export interface AgentRuntime extends AgentBackend {}

/** Default AgentRuntime backed by the package's low-level LLM/tool loop. */
export class DefaultAgentRuntime implements AgentRuntime {
	private readonly defaultStreamFn: StreamFn;

	constructor(streamFn: StreamFn = stream) {
		this.defaultStreamFn = streamFn;
	}

	async runPrompt(request: AgentPromptRunRequest): Promise<void> {
		await runAgentLoop(
			request.messages,
			request.context,
			request.config,
			request.emit,
			request.signal,
			request.streamFn ?? this.defaultStreamFn,
		);
	}

	async continue(request: AgentContinuationRunRequest): Promise<void> {
		await runAgentLoopContinue(
			request.context,
			request.config,
			request.emit,
			request.signal,
			request.streamFn ?? this.defaultStreamFn,
		);
	}
}
