import type { AgentMessage, Api, Model, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { SubagentProgress } from "#pi/subagents/progress";
import type { RunIdentity } from "#pi/subagents/run-identity";
import type { TmuxMetadata } from "#pi/subagents/tmux";
import type { YieldDetails } from "#pi/subagents/yield-result";

export type Visibility = "native" | "tmux";
export type BackendKind = Visibility;
export type SubagentStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type SubagentResumeFailureReason = "context_unavailable" | "not_found" | "no_runner" | "resume_failed";
export type SubagentDelivery = "steer" | "followUp";

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
	parentSessionId?: string;
	storageSessionId?: string;
	signal?: AbortSignal;
}

export interface SubagentRequest extends SubagentRunRequest {
	cwd?: string;
	storageRoot?: string;
	resumeSessionFile?: string;
	visibility?: Visibility;
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
	parent_session_id?: string;
	resumable: boolean;
	created_at: string;
	updated_at: string;
	started_at?: string;
	completed_at?: string;
	last_prompt_sha256?: string;
	result_text?: string;
	error_text?: string;
	session_id?: string;
	session_file?: string;
	artifact_file?: string;
	visibility?: Visibility;
	tmux?: TmuxMetadata;
	identity?: RunIdentity;
	yield_result?: YieldDetails;
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

export interface ResolvedSubagentRequest extends SubagentRequest {
	role: string;
	tools?: string[];
	excludeTools?: string[];
	modelRef?: string;
	modelObject?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	resolvedSystemPrompt?: string;
}

export interface WorkerRequest {
	version: 1;
	subagentId: string;
	storageSessionId: string;
	storageRoot: string;
	request: {
		prompt: string;
		role?: string;
		agent?: string;
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
	};
}

export interface InspectResult {
	ok: boolean;
	record?: SubagentRecord;
	artifactPath?: string;
	workerMetadataPath?: string;
	meta?: { tmux?: TmuxMetadata; identity?: RunIdentity };
	reason?: "not_found";
}

export interface AttachResult {
	ok: boolean;
	record?: SubagentRecord;
	tmuxTarget?: string;
	attachCommand?: string;
	reason?: "not_found" | "not_tmux" | "invalid_identity" | "invalid_metadata" | "identity_mismatch";
}

export type KillFailureReason =
	| "not_found"
	| "not_tmux"
	| "invalid_identity"
	| "invalid_metadata"
	| "identity_mismatch"
	| "already_terminal"
	| "tmux_pane_not_found"
	| "worker_stale"
	| "kill_failed";

export type KillResult =
	| { ok: true; record: SubagentRecord; tmuxTarget: string }
	| { ok: false; reason: KillFailureReason; record?: SubagentRecord; tmuxTarget?: string };

export interface SubagentControls {
	inspect(id: string, sessionId: string): Promise<InspectResult>;
	attach(id: string, sessionId: string): Promise<AttachResult>;
	kill(id: string, sessionId: string): Promise<KillResult>;
}
