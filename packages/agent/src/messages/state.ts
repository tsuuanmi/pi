import type { Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { Tool } from "#agent/tool/tool";

export interface CustomAgentMessages {}

export type AgentMessage = import("@tsuuanmi/pi-ai").Message | CustomAgentMessages[keyof CustomAgentMessages];

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
	set messages(messages: AgentMessage[]);
	get messages(): AgentMessage[];
	readonly isStreaming: boolean;
	readonly streamingMessage?: AgentMessage;
	readonly pendingToolCalls: ReadonlySet<string>;
	readonly errorMessage?: string;
}
