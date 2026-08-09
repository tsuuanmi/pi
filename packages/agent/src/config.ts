import type {
	Context as LlmContext,
	Message as LlmMessage,
	Model,
	ProviderResponse,
	StreamOptions,
} from "@tsuuanmi/pi-ai";
import type { TraceSpan } from "#agent/agent/trace";
import type {
	AfterToolCallContext,
	AfterToolCallResult,
	AgentLoopTurnUpdate,
	BeforeToolCallContext,
	BeforeToolCallResult,
	PrepareNextTurnContext,
	ShouldStopAfterTurnContext,
} from "#agent/hooks";
import type { Message } from "#agent/messages/types";

export type ToolExecutionMode = "sequential" | "parallel";

export type Clock = () => number;
export type RequestIdFactory = (sequence: number, startedAt: number) => string;

export interface ProviderRequestObserverStart {
	requestId: string;
	requestSequence: number;
	model: Model<any>;
	context: LlmContext;
	startedAt: number;
}

export interface ProviderRequestObserverPayload extends ProviderRequestObserverStart {
	payload: unknown;
}

export interface ProviderRequestObserverResponse extends ProviderRequestObserverStart {
	response: ProviderResponse;
}

export interface ProviderRequestObserverComplete extends ProviderRequestObserverStart {
	completedAt: number;
	durationMs: number;
	message?: import("@tsuuanmi/pi-ai").AssistantMessage;
	error?: unknown;
	aborted: boolean;
	span?: TraceSpan;
}

export interface ProviderRequestObserver {
	onRequestStart?: (event: ProviderRequestObserverStart) => void | Promise<void>;
	onRequestPayload?: (event: ProviderRequestObserverPayload) => void | Promise<void>;
	onRequestResponse?: (event: ProviderRequestObserverResponse) => void | Promise<void>;
	onRequestComplete?: (event: ProviderRequestObserverComplete) => void | Promise<void>;
}

export type QueueMode = "all" | "one-at-a-time";

export interface AgentLoopConfig extends StreamOptions {
	model: Model<any>;
	reasoning?: StreamOptions["reasoning"];
	apiKey?: StreamOptions["apiKey"];
	onPayload?: StreamOptions["onPayload"];
	onResponse?: StreamOptions["onResponse"];
	providerRequestObserver?: ProviderRequestObserver;
	/** Clock used for loop timestamps. Defaults to Date.now. */
	now?: Clock;
	/** Creates provider request ids from the monotonic in-process sequence and start timestamp. */
	createRequestId?: RequestIdFactory;
	/** Maximum duration for one provider request. Finite values are floored and clamped to at least 1. */
	requestTimeoutMs?: number;
	convertToLlm: (messages: Message[]) => LlmMessage[] | Promise<LlmMessage[]>;
	transformContext?: (messages: Message[], signal?: AbortSignal) => Promise<Message[]>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	loopDetection?: boolean | import("#agent/agent/loop-detector").LoopDetectionOptions;
	maxTurns?: number;
	shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;
	prepareNextTurn?: (
		context: PrepareNextTurnContext,
	) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;
	getSteeringMessages?: () => Promise<Message[]>;
	getFollowUpMessages?: () => Promise<Message[]>;
	toolExecution?: ToolExecutionMode;
	/** Maximum concurrently executing tools for parallel tool batches. Finite values are floored and clamped to at least 1. */
	maxToolConcurrency?: number;
	/** Maximum text characters emitted from each tool result. Finite values are floored and clamped to at least 1. */
	maxToolOutputChars?: number;
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
}
