/**
 * Subagent record, request, and result types.
 *
 * Shared by @tsuuanmi/pi-agent consumers and @tsuuanmi/pi so the subagent
 * contract lives in the lower layer.
 */

import type { ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { AgentMessage } from "#agent/messages/state";
import type { SubagentProgress } from "#agent/subagents/progress";
import type { YieldDetails } from "#agent/subagents/yield-result";

export type SubagentStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type SubagentResumeFailureReason = "context_unavailable" | "not_found" | "no_runner" | "resume_failed";
export type SubagentDelivery = "steer" | "followUp";

export interface SubagentRecord {
	id: string;
	role: string;
	label?: string;
	agent_profile?: string;
	model?: string;
	thinking_level?: ThinkingLevel;
	status: SubagentStatus;
	parent_session_id?: string;
	resumable: boolean;
	created_at: string;
	updated_at: string;
	started_at?: string;
	completed_at?: string;
	last_prompt_sha256?: string;
	result_text?: string;
	error_text?: string;
	/** Structured yield result if the subagent called the yield tool. */
	yield_result?: YieldDetails;
}

export interface SubagentRunRequest {
	agent?: string;
	role?: string;
	prompt: string;
	systemPrompt?: string;
	tools?: string[];
	excludeTools?: string[];
	model?: string;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	detached?: boolean;
	label?: string;
	/** Opaque owner scope used to correlate records. */
	parentSessionId?: string;
	/** Opaque owner scope used to store durable records. */
	storageSessionId?: string;
	signal?: AbortSignal;
}

export interface SubagentRunResult {
	record: SubagentRecord;
	messages: AgentMessage[];
	output: string;
}

export interface SubagentAwaitOptions {
	timeoutMs?: number;
	sessionId: string;
}

export type SubagentAwaitResult =
	| { ok: true; result: SubagentRunResult; timedOut?: false }
	| {
			ok: false;
			reason: "not_found" | "timeout";
			record?: SubagentRecord;
			timedOut?: true;
			progress?: SubagentProgress;
	  };

export type SubagentResumeResult =
	| { ok: true; result: SubagentRunResult }
	| { ok: false; reason: SubagentResumeFailureReason; record?: SubagentRecord };
