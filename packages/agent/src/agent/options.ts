import type { Message as LlmMessage, StreamOptions, Transport } from "@tsuuanmi/pi-ai";
import type { LoopDetectionOptions } from "#agent/agent/loop-detector";
import type { AgentState } from "#agent/agent/state";
import type { Clock, ProviderRequestObserver, QueueMode, RequestIdFactory, ToolExecutionMode } from "#agent/config";
import type { AgentHook } from "#agent/hooks";
import type { Message } from "#agent/messages/types";
import type { StreamFunction } from "#agent/stream";

/** Options for constructing an {@link Agent}. */
export interface AgentOptions {
	/** Stable name used by teams, orchestrators, logs, and tracing. */
	name?: string;
	/** Capability labels used by team/orchestrator scheduling. */
	capabilities?: readonly string[];
	initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
	convertToLlm?: (messages: Message[]) => LlmMessage[] | Promise<LlmMessage[]>;
	transformContext?: (messages: Message[], signal?: AbortSignal) => Promise<Message[]>;
	stream?: StreamFunction;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	onPayload?: StreamOptions["onPayload"];
	onResponse?: StreamOptions["onResponse"];
	providerRequestObserver?: ProviderRequestObserver;
	/** Clock used for agent-created timestamps. Defaults to Date.now. */
	now?: Clock;
	/** Creates provider request ids from the request sequence and timestamp. */
	createRequestId?: RequestIdFactory;
	/** Maximum duration for one provider request. */
	requestTimeoutMs?: number;
	/** Initial agent lifecycle and execution hooks. */
	hooks?: readonly AgentHook[];
	extractStructured?: (output: string) => unknown;
	steeringMode?: QueueMode;
	followUpMode?: QueueMode;
	sessionId?: string;
	transport?: Transport;
	maxRetryDelayMs?: number;
	toolExecution?: ToolExecutionMode;
	/** Maximum concurrently executing tools for parallel tool batches. */
	maxToolConcurrency?: number;
	/** Maximum text characters emitted from each tool result. */
	maxToolOutputChars?: number;
	/** Detect repeated assistant turns. Disabled by default; pass true for conservative tool-call detection. */
	loopDetection?: boolean | LoopDetectionOptions;
	/** Maximum assistant turns for each prompt/continuation run. Finite values are floored and clamped to at least 1. */
	maxTurns?: number;
	/** Cooperative pause callback. Checked after each turn; when true the agent stops gracefully. */
	shouldPause?: () => boolean;
}
