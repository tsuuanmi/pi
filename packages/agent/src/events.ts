import type { AssistantMessageEvent, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { LoopDetectionResult } from "#agent/agent/loop-detector";
import type { AgentStatus, AgentTraceEvent, Message, TraceSpan } from "#agent/messages/state";

export type ToolExecutionStatus = "completed" | "failed" | "blocked" | "aborted";

export interface ToolExecutionMeta {
	status: ToolExecutionStatus;
	span: TraceSpan;
	truncated?: boolean;
	originalChars?: number;
	emittedChars?: number;
}

export interface Warning {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

export type AgentEvent =
	| { type: "agent_start" }
	| { type: "agent_status"; status: AgentStatus; trace?: AgentTraceEvent }
	| { type: "trace"; trace: AgentTraceEvent }
	| { type: "warning"; warning: Warning }
	| { type: "agent_end"; messages: Message[] }
	| { type: "turn_start" }
	| { type: "turn_end"; message: Message; toolResults: ToolResultMessage[] }
	| { type: "loop_detected"; result: LoopDetectionResult }
	| { type: "max_turns_reached"; turns: number; maxTurns: number }
	| {
			type: "structured_output";
			ok: boolean;
			attempt: number;
			error?: string;
			issues?: string[];
			preview?: string;
	  }
	| { type: "message_start"; message: Message }
	| { type: "message_update"; message: Message; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: Message }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			result: any;
			isError: boolean;
			meta: ToolExecutionMeta;
	  };

export type EventSink = (event: AgentEvent) => Promise<void> | void;
