import type { TmuxTarget } from "#pi/subagents/tmux";
import type { SubagentRecord, SubagentStatus } from "#pi/subagents/types";

export interface RunIdentityOwner {
	kind: "pi-subagent-worker";
	parent_session_id: string;
	storage_session_id: string;
	storage_root: string;
	execution_cwd: string;
}

export interface RunIdentity {
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
	owner: RunIdentityOwner;
	tmux: {
		backend: "tmux";
		session_name: string;
		target: TmuxTarget;
		request_path: string;
		worker_metadata_path: string;
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isStatus(value: unknown): value is SubagentStatus {
	return (
		value === "queued" ||
		value === "running" ||
		value === "paused" ||
		value === "completed" ||
		value === "failed" ||
		value === "cancelled"
	);
}

function isPane(value: unknown): value is Extract<TmuxTarget, { kind: "pane" }> {
	if (!isObject(value)) return false;
	return (
		value.kind === "pane" &&
		isString(value.session_name) &&
		isString(value.session_id) &&
		isString(value.window_id) &&
		typeof value.window_index === "number" &&
		Number.isInteger(value.window_index) &&
		isString(value.pane_id) &&
		typeof value.pane_index === "number" &&
		Number.isInteger(value.pane_index) &&
		isString(value.target)
	);
}

function isSession(value: unknown): value is Extract<TmuxTarget, { kind: "session" }> {
	if (!isObject(value)) return false;
	return (
		value.kind === "session" && isString(value.session_name) && isString(value.session_id) && isString(value.target)
	);
}

function isTarget(value: unknown): value is TmuxTarget {
	return isPane(value) || isSession(value);
}

function isOwner(value: unknown): value is RunIdentityOwner {
	if (!isObject(value)) return false;
	return (
		value.kind === "pi-subagent-worker" &&
		isString(value.parent_session_id) &&
		isString(value.storage_session_id) &&
		isString(value.storage_root) &&
		isString(value.execution_cwd)
	);
}

export function isRunIdentity(value: unknown): value is RunIdentity {
	if (!isObject(value)) return false;
	return (
		value.version === 1 &&
		isString(value.subagent_id) &&
		isString(value.parent_session_id) &&
		isString(value.storage_session_id) &&
		isString(value.storage_root) &&
		isString(value.execution_cwd) &&
		isString(value.request_path) &&
		isString(value.record_path) &&
		isString(value.artifact_path) &&
		isString(value.worker_metadata_path) &&
		isStatus(value.lifecycle_state) &&
		typeof value.cleanup_eligible === "boolean" &&
		isOwner(value.owner) &&
		isObject(value.tmux) &&
		value.tmux.backend === "tmux" &&
		isString(value.tmux.session_name) &&
		isTarget(value.tmux.target) &&
		isString(value.tmux.request_path) &&
		isString(value.tmux.worker_metadata_path)
	);
}

export function createRunIdentity(input: {
	subagentId: string;
	parentSessionId: string;
	storageSessionId: string;
	storageRoot: string;
	executionCwd: string;
	requestPath: string;
	recordPath: string;
	artifactPath: string;
	workerMetadataPath: string;
	lifecycleState: SubagentStatus;
	cleanupEligible: boolean;
	tmux: Omit<RunIdentity["tmux"], "session_name">;
}): RunIdentity {
	return {
		version: 1,
		subagent_id: input.subagentId,
		parent_session_id: input.parentSessionId,
		storage_session_id: input.storageSessionId,
		storage_root: input.storageRoot,
		execution_cwd: input.executionCwd,
		request_path: input.requestPath,
		record_path: input.recordPath,
		artifact_path: input.artifactPath,
		worker_metadata_path: input.workerMetadataPath,
		lifecycle_state: input.lifecycleState,
		cleanup_eligible: input.cleanupEligible,
		owner: {
			kind: "pi-subagent-worker",
			parent_session_id: input.parentSessionId,
			storage_session_id: input.storageSessionId,
			storage_root: input.storageRoot,
			execution_cwd: input.executionCwd,
		},
		tmux: {
			...input.tmux,
			session_name: input.tmux.target.session_name,
		},
	};
}

export function recordMatchesIdentity(
	record: (SubagentRecord & { cwd: string; parent_session_id?: string; identity?: RunIdentity }) | undefined,
	identity: RunIdentity | undefined,
): boolean {
	if (!record || !identity) return false;
	if (record.id !== identity.subagent_id) return false;
	if (record.parent_session_id !== identity.parent_session_id) return false;
	if (record.cwd !== identity.execution_cwd) return false;
	if (record.identity?.storage_root !== identity.storage_root) return false;
	if (record.identity?.storage_session_id !== identity.storage_session_id) return false;
	if (record.identity?.tmux?.target?.target !== identity.tmux.target.target) return false;
	return true;
}
