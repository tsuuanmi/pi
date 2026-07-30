import type {
	Context,
	Message,
	Model,
	ProviderResponse,
	StreamOptions,
	stream,
	ToolResultMessage,
} from "@tsuuanmi/pi-ai";
import type { AgentMessage } from "#agent/messages/state";
import type { AgentContext, AgentToolResult } from "#agent/tool/types";

export type StreamFn = (
	...args: Parameters<typeof stream>
) => ReturnType<typeof stream> | Promise<ReturnType<typeof stream>>;

export type ToolExecutionMode = "sequential" | "parallel";

export interface ProviderRequestObserverStart {
	requestId: string;
	requestSequence: number;
	model: Model<any>;
	context: Context;
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
}

export interface ProviderRequestObserver {
	onRequestStart?: (event: ProviderRequestObserverStart) => void | Promise<void>;
	onRequestPayload?: (event: ProviderRequestObserverPayload) => void | Promise<void>;
	onRequestResponse?: (event: ProviderRequestObserverResponse) => void | Promise<void>;
	onRequestComplete?: (event: ProviderRequestObserverComplete) => void | Promise<void>;
}

export type QueueMode = "all" | "one-at-a-time";

export type AgentToolCall = Extract<
	import("@tsuuanmi/pi-ai").AssistantMessage["content"][number],
	{ type: "toolCall" }
>;

export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
}

export interface AfterToolCallResult {
	content?: import("@tsuuanmi/pi-ai").TextContent[];
	details?: unknown;
	isError?: boolean;
	terminate?: boolean;
}

export interface BeforeToolCallContext {
	assistantMessage: import("@tsuuanmi/pi-ai").AssistantMessage;
	toolCall: AgentToolCall;
	args: unknown;
	context: AgentContext;
}

export interface AfterToolCallContext {
	assistantMessage: import("@tsuuanmi/pi-ai").AssistantMessage;
	toolCall: AgentToolCall;
	args: unknown;
	result: AgentToolResult<any>;
	isError: boolean;
	context: AgentContext;
}

export interface ShouldStopAfterTurnContext {
	message: import("@tsuuanmi/pi-ai").AssistantMessage;
	toolResults: ToolResultMessage[];
	context: AgentContext;
	newMessages: AgentMessage[];
}

export interface AgentLoopTurnUpdate {
	context?: AgentContext;
	model?: Model<any>;
	thinkingLevel?: import("#agent/messages/state").ThinkingLevel;
}

export interface PrepareNextTurnContext extends ShouldStopAfterTurnContext {}

export interface AgentLoopConfig extends StreamOptions {
	model: Model<any>;
	reasoning?: StreamOptions["reasoning"];
	apiKey?: StreamOptions["apiKey"];
	onPayload?: StreamOptions["onPayload"];
	onResponse?: StreamOptions["onResponse"];
	providerRequestObserver?: ProviderRequestObserver;
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
	loopDetection?: boolean | import("#agent/agent/loop-detector").LoopDetectionOptions;
	maxTurns?: number;
	shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;
	prepareNextTurn?: (
		context: PrepareNextTurnContext,
	) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;
	getSteeringMessages?: () => Promise<AgentMessage[]>;
	getFollowUpMessages?: () => Promise<AgentMessage[]>;
	toolExecution?: ToolExecutionMode;
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
}
