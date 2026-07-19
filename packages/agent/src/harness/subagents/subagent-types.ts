/**
 * Subagent record, request, and result types.
 *
 * Shared by @tsuuanmi/pi-agent consumers (e.g. @tsuuanmi/pi-workflows) and
 * @tsuuanmi/pi so the subagent contract lives in the lower layer.
 */

import type { AgentMessage, ThinkingLevel } from "#agent/agent/types";
import type { SubagentProgress } from "#agent/harness/subagents/subagent-progress";
import type { YieldDetails } from "#agent/harness/subagents/yield-result";

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
	cwd: string;
	session_id?: string;
	session_file?: string;
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
	cwd?: string;
	tools?: string[];
	excludeTools?: string[];
	model?: string;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	detached?: boolean;
	label?: string;
	parentSessionId?: string;
	/** Session id that owns durable subagent records. Defaults to parentSessionId. */
	storageSessionId?: string;
	signal?: AbortSignal;
	resumeSessionFile?: string;
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
