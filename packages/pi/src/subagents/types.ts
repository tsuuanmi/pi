import type {
	SubagentRecord as AgentRecord,
	SubagentRunRequest as AgentRequest,
	SubagentRunResult as AgentResult,
} from "@tsuuanmi/pi-agent";
import type { Api, Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { RunIdentity } from "#pi/subagents/run-identity";
import type { TmuxMetadata } from "#pi/subagents/tmux";

export type Visibility = "native" | "tmux";
export type BackendKind = "native" | "tmux";

export interface SubagentRequest extends AgentRequest {
	cwd?: string;
	storageRoot?: string;
	resumeSessionFile?: string;
	visibility?: Visibility;
}

export interface SubagentRecord extends AgentRecord {
	cwd: string;
	session_id?: string;
	session_file?: string;
	artifact_file?: string;
	visibility?: Visibility;
	tmux?: TmuxMetadata;
	identity?: RunIdentity;
}

export interface SubagentRunResult extends Omit<AgentResult, "record"> {
	record: SubagentRecord;
}

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
