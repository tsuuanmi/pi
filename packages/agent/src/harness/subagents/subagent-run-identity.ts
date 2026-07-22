import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	SubagentRecord,
	SubagentRunIdentity,
	SubagentStatus,
	SubagentTmuxPaneTarget,
	SubagentTmuxSessionTarget,
	SubagentTmuxTarget,
} from "#agent/harness/subagents/subagent-types";

export const SUBAGENT_RUN_IDENTITY_SCHEMA_PATH = fileURLToPath(
	new URL("./subagent-run-identity.schema.json", import.meta.url),
);

export const SUBAGENT_RUN_IDENTITY_SCHEMA = JSON.parse(
	readFileSync(SUBAGENT_RUN_IDENTITY_SCHEMA_PATH, "utf8"),
) as Record<string, unknown>;

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

function isTargetPane(value: unknown): value is SubagentTmuxPaneTarget {
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

function isTargetSession(value: unknown): value is SubagentTmuxSessionTarget {
	if (!isObject(value)) return false;
	return (
		value.kind === "session" && isString(value.session_name) && isString(value.session_id) && isString(value.target)
	);
}

function isTmuxTarget(value: unknown): value is SubagentTmuxTarget {
	return isTargetPane(value) || isTargetSession(value);
}

function isIdentityOwner(value: unknown): boolean {
	if (!isObject(value)) return false;
	return (
		value.kind === "pi-subagent-worker" &&
		isString(value.parent_session_id) &&
		isString(value.storage_session_id) &&
		isString(value.storage_root) &&
		isString(value.execution_cwd)
	);
}

export function isSubagentRunIdentity(value: unknown): value is SubagentRunIdentity {
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
		isIdentityOwner(value.owner) &&
		isObject(value.tmux) &&
		value.tmux.backend === "tmux" &&
		isString(value.tmux.session_name) &&
		isTmuxTarget(value.tmux.target) &&
		isString(value.tmux.request_path) &&
		isString(value.tmux.worker_metadata_path)
	);
}

export function createSubagentRunIdentity(input: {
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
	tmux: Omit<SubagentRunIdentity["tmux"], "session_name"> & { session_name?: string };
}): SubagentRunIdentity {
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
			session_name: input.tmux.session_name ?? input.tmux.target.session_name,
		},
	};
}

export function buildTmuxCommands(
	target: SubagentTmuxTarget,
	tmuxCommand: string,
): {
	attachCommand: string;
	inspectCommand: string;
	cleanupCommand: string;
} {
	const attachCommand =
		target.kind === "pane"
			? `${tmuxCommand} select-pane -t ${target.target}`
			: `${tmuxCommand} attach-session -t ${target.target}`;
	const inspectCommand =
		target.kind === "pane"
			? `${tmuxCommand} list-panes -t ${target.session_name} -F '#{pane_id} #{pane_index} #{pane_current_command}'`
			: `${tmuxCommand} list-sessions -F '#{session_name} #{session_id} #{session_windows}'`;
	const cleanupCommand =
		target.kind === "pane"
			? `${tmuxCommand} kill-pane -t ${target.target}`
			: `${tmuxCommand} kill-session -t ${target.target}`;
	return { attachCommand, inspectCommand, cleanupCommand };
}

export function tmuxTargetToString(target: SubagentTmuxTarget): string {
	return target.target;
}

export function tmuxRecordMatchesIdentity(
	record: SubagentRecord | undefined,
	identity: SubagentRunIdentity | undefined,
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
