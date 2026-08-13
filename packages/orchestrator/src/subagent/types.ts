import type { AgentMessage, Api, Model, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { SubagentProgress } from "#orchestrator/subagent/progress";
import type { YieldDetails } from "#orchestrator/subagent/yield-result";
export type SubagentStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type SubagentResumeFailureReason = "context_unavailable" | "not_found" | "no_runner" | "resume_failed";
export type SubagentDelivery = "steer" | "followUp";

export type SubagentOutputArtifactMode = "create" | "replace";
export type SubagentMetadataValue = string | number | boolean;

export interface SubagentOutputArtifactRequest {
	path: string;
	mode: SubagentOutputArtifactMode;
	mediaType?: string;
	expectedSha256?: string;
}

export interface SubagentOutputArtifact {
	path: string;
	sha256: string;
	media_type?: string;
	mode: SubagentOutputArtifactMode;
}

export interface SubagentRunRequest {
	agent?: string;
	role?: string;
	prompt?: string;
	promptFile?: string;
	systemPrompt?: string;
	tools?: string[];
	excludeTools?: string[];
	model?: string;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	detached?: boolean;
	maxDurationMs?: number;
	label?: string;
	outputArtifact?: SubagentOutputArtifactRequest;
	metadata?: Record<string, SubagentMetadataValue>;
	cwd?: string;
	parentSessionId?: string;
	storageSessionId?: string;
	signal?: AbortSignal;
}

export interface SubagentRequest extends SubagentRunRequest {
	storageRoot?: string;
	resumeSessionFile?: string;
}

export interface SubagentRecord {
	id: string;
	role: string;
	label?: string;
	agent_profile?: string;
	model?: string;
	thinking_level?: ThinkingLevel;
	max_duration_ms?: number;
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
	output_artifact?: SubagentOutputArtifact;
	execution_metadata?: Record<string, SubagentMetadataValue>;
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
	prompt: string;
	tools?: string[];
	excludeTools?: string[];
	modelRef?: string;
	modelObject?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	resolvedSystemPrompt?: string;
}

export interface InspectResult {
	ok: boolean;
	record?: SubagentRecord;
	artifactPath?: string;
	reason?: "not_found";
}

export interface SubagentInspection {
	inspect(id: string, sessionId: string): Promise<InspectResult>;
}
