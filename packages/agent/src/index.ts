import { isValidThinkingLevel, type ThinkingLevel } from "@tsuuanmi/pi-ai";

export type { Api, Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
export { isValidThinkingLevel } from "@tsuuanmi/pi-ai";

export function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !isValidThinkingLevel(value)) {
		throw new Error(`invalid thinkingLevel: ${String(value)}`);
	}
	return value;
}
export { Agent } from "#agent/agent";
export * from "#agent/agent/loop-detector";
export type { AgentOptions } from "#agent/agent/options";
export * from "#agent/agent/pruning";
export type { AgentState, AgentStatus } from "#agent/agent/state";
export * from "#agent/agent/structured-output";
export type { AgentTraceEvent, TraceSpan, TraceStatus } from "#agent/agent/trace";
export * from "#agent/compaction/messages";
export type {
	AgentLoopConfig,
	Clock,
	ProviderRequestObserver,
	ProviderRequestObserverComplete,
	ProviderRequestObserverPayload,
	ProviderRequestObserverResponse,
	ProviderRequestObserverStart,
	QueueMode,
	RequestIdFactory,
	ToolExecutionMode,
} from "#agent/config";
export type { Context } from "#agent/context";
export type {
	AgentEvent,
	EventSink,
	ToolExecutionMeta,
	ToolExecutionStatus,
	Warning,
} from "#agent/events";
export type {
	AfterToolCallContext,
	AfterToolCallResult,
	AgentHook,
	AgentLoopTurnUpdate,
	AgentRunHookContext,
	AgentRunResultHookContext,
	BeforeToolCallContext,
	BeforeToolCallResult,
	PrepareNextTurnContext,
	ShouldStopAfterTurnContext,
} from "#agent/hooks";
export * from "#agent/messages/messages";
export * from "#agent/messages/types";
export * from "#agent/metadata/receipt";
export type { AgentRunOptions, AgentRunResult } from "#agent/run";
export type { StreamFunction } from "#agent/stream";
export * from "#agent/tool/output";
export * from "#agent/tool/policy";
export * from "#agent/tool/receipts";
export * from "#agent/tool/registry";
export * from "#agent/tool/result";
export * from "#agent/tool/tool";
export type { ToolCall } from "#agent/tool-call";
