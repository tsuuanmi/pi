import type { AssistantMessageEvent, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { LoopDetectionResult } from "#agent/agent/loop-detector";
import type { AgentMessage, AgentStatus, AgentTraceEvent, TraceSpan } from "#agent/messages/state";

export type ToolExecutionStatus = "completed" | "failed" | "blocked" | "aborted";

export interface ToolExecutionMeta {
	status: ToolExecutionStatus;
	span: TraceSpan;
	truncated?: boolean;
	originalChars?: number;
	emittedChars?: number;
}

export type AgentEvent =
	| { type: "agent_start" }
	| { type: "agent_status"; status: AgentStatus; trace?: AgentTraceEvent }
	| { type: "runtime_trace"; trace: AgentTraceEvent }
	| { type: "runtime_warning"; warning: { code: string; message: string; details?: Record<string, unknown> } }
	| { type: "agent_end"; messages: AgentMessage[] }
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
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
	| { type: "message_start"; message: AgentMessage }
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
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
