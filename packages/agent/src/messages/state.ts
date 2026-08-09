import type { Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { Message } from "#agent/messages/types";
import type { Tool } from "#agent/tool/tool";

export type {
	BashExecutionMessage,
	BranchSummaryMessage,
	CompactionSummaryMessage,
	CustomMessage,
	CustomMessages,
	Message,
} from "#agent/messages/types";

export type AgentStatus = "idle" | "running" | "paused" | "aborted" | "failed";

export type TraceStatus = "ok" | "error" | "aborted" | "timeout" | "blocked";

export interface TraceSpan {
	kind: "request" | "tool";
	id: string;
	name?: string;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	status: TraceStatus;
}

export interface AgentTraceEvent {
	type: "trace";
	name: string;
	timestamp: number;
	details?: Record<string, unknown>;
	span?: TraceSpan;
}

export interface AgentState {
	systemPrompt: string;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	readonly tools: readonly Tool[];
	set messages(messages: Message[]);
	get messages(): Message[];
	readonly isStreaming: boolean;
	readonly streamingMessage?: Message;
	readonly pendingToolCalls: ReadonlySet<string>;
	readonly errorMessage?: string;
}
