import type { Model } from "@tsuuanmi/pi-ai";
import type { AgentTool } from "#agent/tool/types";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface CustomAgentMessages {}

export type AgentMessage = import("@tsuuanmi/pi-ai").Message | CustomAgentMessages[keyof CustomAgentMessages];

export type AgentStatus = "idle" | "running" | "paused" | "aborted" | "failed";

export interface AgentTraceEvent {
	type: "trace";
	name: string;
	timestamp: number;
	details?: Record<string, unknown>;
}

export interface AgentState {
	systemPrompt: string;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	set tools(tools: AgentTool<any>[]);
	get tools(): AgentTool<any>[];
	set messages(messages: AgentMessage[]);
	get messages(): AgentMessage[];
	readonly isStreaming: boolean;
	readonly streamingMessage?: AgentMessage;
	readonly pendingToolCalls: ReadonlySet<string>;
	readonly errorMessage?: string;
}
