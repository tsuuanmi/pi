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
export type SubagentVisibility = "native" | "tmux" | "auto";
export type SubagentBackendKind = "native" | "tmux";
export type SubagentControlAction = "inspect" | "attach" | "kill";
export type SubagentKillFailureReason =
	| "not_found"
	| "not_tmux"
	| "legacy_record"
	| "identity_mismatch"
	| "already_terminal"
	| "tmux_pane_not_found"
	| "worker_stale"
	| "kill_failed";

export interface SubagentTmuxPaneTarget {
	kind: "pane";
	session_name: string;
	session_id: string;
	window_id: string;
	window_index: number;
	pane_id: string;
	pane_index: number;
	target: string;
}

export interface SubagentTmuxSessionTarget {
	kind: "session";
	session_name: string;
	session_id: string;
	target: string;
}

export type SubagentTmuxTarget = SubagentTmuxPaneTarget | SubagentTmuxSessionTarget;

export interface SubagentTmuxMetadata {
	backend: "tmux";
	session_name: string;
	target: SubagentTmuxTarget;
	request_file: string;
	worker_metadata_file: string;
	attach_command: string;
	inspect_command: string;
	cleanup_command: string;
	visible_by_default: boolean;
}

export interface SubagentRunIdentityOwner {
	kind: "pi-subagent-worker";
	parent_session_id: string;
	storage_session_id: string;
	storage_root: string;
	execution_cwd: string;
}

export interface SubagentRunIdentity {
	version: 1;
	subagent_id: string;
	parent_session_id: string;
	storage_session_id: string;
	storage_root: string;
	execution_cwd: string;
	request_path: string;
	record_path: string;
	artifact_path: string;
	worker_metadata_path: string;
	lifecycle_state: SubagentStatus;
	cleanup_eligible: boolean;
	owner: SubagentRunIdentityOwner;
	tmux: {
		backend: "tmux";
		session_name: string;
		target: SubagentTmuxTarget;
		request_path: string;
		worker_metadata_path: string;
	};
}

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
	artifact_file?: string;
	parent_session_id?: string;
	visibility?: SubagentVisibility;
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
	/** tmux backend launch and inspection metadata. */
	tmux?: SubagentTmuxMetadata;
	/** Canonical run identity for tmux-backed subagents. */
	identity?: SubagentRunIdentity;
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
	/** Visibility preference. `native` uses Pi receipts/status, `tmux` asks for an explicit tmux-visible panel, `auto` lets the runner choose. */
	visibility?: SubagentVisibility;
	parentSessionId?: string;
	/** Session id that owns durable subagent records. Defaults to parentSessionId. */
	storageSessionId?: string;
	/** Root cwd that owns durable session records. Defaults to the manager cwd. */
	storageRoot?: string;
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

export interface SubagentInspectResult {
	ok: boolean;
	record?: SubagentRecord;
	artifactPath?: string;
	workerMetadataPath?: string;
	meta?: { tmux?: SubagentTmuxMetadata; identity?: SubagentRunIdentity };
	reason?: "not_found";
}

export interface SubagentAttachResult {
	ok: boolean;
	record?: SubagentRecord;
	tmuxTarget?: string;
	attachCommand?: string;
	reason?: "not_found" | "not_tmux" | "legacy_record" | "identity_mismatch";
}

export type SubagentKillResult =
	| { ok: true; record: SubagentRecord; tmuxTarget: string }
	| { ok: false; reason: SubagentKillFailureReason; record?: SubagentRecord; tmuxTarget?: string };

export type SubagentResumeResult =
	| { ok: true; result: SubagentRunResult }
	| { ok: false; reason: SubagentResumeFailureReason; record?: SubagentRecord };
