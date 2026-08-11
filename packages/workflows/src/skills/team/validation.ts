import type {
	TeamCompletionEvidence,
	TeamCompletionGate,
	TeamConfig,
	TeamGateEscalation,
	TeamReviewGate,
	TeamTask,
	TeamTaskExecution,
	TeamTaskGateEscalation,
	TeamTaskStatus,
	TeamWorker,
} from "#workflows/skills/team/types";
import { nowIso } from "#workflows/state/state-writer";

const TEAM_TASK_STATUSES = ["pending", "blocked", "in_progress", "completed", "failed"] as const;
const TEAM_PHASES = ["starting", "running", "awaiting_integration", "complete", "failed", "cancelled"] as const;
const WORKER_STATUSES = ["idle", "working", "blocked", "done", "failed"] as const;
const REVIEW_GATE_STATUSES = ["passed", "blocked", "retry_requested", "human_blocked"] as const;
const REVIEW_SEVERITIES = ["none", "low", "medium", "high"] as const;
const COMPLETION_SHIP_DECISIONS = ["ship", "ship_with_caveats", "blocked"] as const;
const COMPLETION_ESCALATIONS = ["none", "retry", "human_blocked"] as const;

export function assertSafeId(label: string, value: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value) || value.includes("..")) {
		throw new Error(`invalid ${label}: ${value}`);
	}
}

export function slugifyTeamId(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40)
		.replace(/-$/, "");
	if (!slug) throw new Error("team task must contain characters usable in a team id");
	return slug;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function persistedObject(value: unknown, context: string): Record<string, unknown> {
	if (!isObject(value)) throw new Error(`invalid persisted ${context}: expected an object`);
	return value;
}

function requiredString(value: unknown, context: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`invalid persisted ${context}: expected a non-empty string`);
	}
	return value;
}

function optionalString(value: unknown, context: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`invalid persisted ${context}: expected a non-empty string`);
	}
	return value;
}

function requiredTrimmedString(value: unknown, context: string): string {
	const result = requiredString(value, context);
	if (result.trim() !== result) throw new Error(`invalid persisted ${context}: must not have surrounding whitespace`);
	return result;
}

function requiredInteger(value: unknown, context: string, minimum = 0): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
		throw new Error(`invalid persisted ${context}: expected an integer >= ${minimum}`);
	}
	return value;
}

function optionalStringArray(value: unknown, context: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`invalid persisted ${context}: expected an array`);
	return value.map((item, index) => requiredTrimmedString(item, `${context}[${index}]`));
}

function requiredStringArray(value: unknown, context: string): string[] {
	const result = optionalStringArray(value, context);
	if (!result) throw new Error(`invalid persisted ${context}: expected an array`);
	return result;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], context: string): T {
	if (typeof value === "string" && values.includes(value as T)) return value as T;
	throw new Error(`invalid persisted ${context}: unsupported value ${String(value)}`);
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[], context: string): T | undefined {
	if (value === undefined) return undefined;
	return enumValue(value, values, context);
}

function parseExecution(value: unknown, context: string): TeamTaskExecution | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const status = enumValue(
		object.status,
		["pending", "in_progress", "completed", "failed", "blocked", "skipped"],
		`${context}.status`,
	);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	const receiptIds = requiredStringArray(object.receipt_ids, `${context}.receipt_ids`);
	const error = optionalString(object.error, `${context}.error`);
	if (error !== undefined && error.trim().length === 0) {
		throw new Error(`invalid persisted ${context}.error: expected a non-empty string`);
	}
	return { status, updated_at: updatedAt, receipt_ids: receiptIds, ...(error !== undefined ? { error } : {}) };
}

function parseReviewGate(value: unknown, context: string): TeamReviewGate | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const gate = enumValue(object.gate, ["review"], `${context}.gate`);
	const status = enumValue(object.status, REVIEW_GATE_STATUSES, `${context}.status`);
	const attempt = requiredInteger(object.attempt, `${context}.attempt`);
	const artifactPath = optionalString(object.artifact_path, `${context}.artifact_path`);
	const maxSeverity = optionalEnum(object.max_severity, REVIEW_SEVERITIES, `${context}.max_severity`);
	const needsChanges = object.needs_changes;
	if (needsChanges !== undefined && typeof needsChanges !== "boolean") {
		throw new Error(`invalid persisted ${context}.needs_changes: expected a boolean`);
	}
	const summary = optionalString(object.summary, `${context}.summary`);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	return {
		gate,
		status,
		attempt,
		...(artifactPath !== undefined ? { artifact_path: artifactPath } : {}),
		...(maxSeverity !== undefined ? { max_severity: maxSeverity } : {}),
		...(needsChanges !== undefined ? { needs_changes: needsChanges } : {}),
		...(summary !== undefined ? { summary } : {}),
		updated_at: updatedAt,
	};
}

function parseTaskGateEscalation(value: unknown, context: string): TeamTaskGateEscalation | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const gate = enumValue(object.gate, ["review"], `${context}.gate`);
	const status = enumValue(object.status, ["retry_requested", "human_blocked"], `${context}.status`);
	const attempt = requiredInteger(object.attempt, `${context}.attempt`);
	const reason = requiredString(object.reason, `${context}.reason`);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	return { gate, status, attempt, reason, updated_at: updatedAt };
}

function parseCompletionGate(value: unknown, context: string): TeamCompletionGate | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const gate = enumValue(object.gate, ["completion"], `${context}.gate`);
	const status = enumValue(object.status, REVIEW_GATE_STATUSES, `${context}.status`);
	const attempt = requiredInteger(object.attempt, `${context}.attempt`);
	const artifactPath = optionalString(object.artifact_path, `${context}.artifact_path`);
	const shipDecision = optionalEnum(object.ship_decision, COMPLETION_SHIP_DECISIONS, `${context}.ship_decision`);
	const escalation = optionalEnum(object.escalation, COMPLETION_ESCALATIONS, `${context}.escalation`);
	const summary = optionalString(object.summary, `${context}.summary`);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	return {
		gate,
		status,
		attempt,
		...(artifactPath !== undefined ? { artifact_path: artifactPath } : {}),
		...(shipDecision !== undefined ? { ship_decision: shipDecision } : {}),
		...(escalation !== undefined ? { escalation } : {}),
		...(summary !== undefined ? { summary } : {}),
		updated_at: updatedAt,
	};
}

function parseCompletionGateEscalation(value: unknown, context: string): TeamGateEscalation | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const gate = enumValue(object.gate, ["completion"], `${context}.gate`);
	const status = enumValue(object.status, ["retry_requested", "human_blocked"], `${context}.status`);
	const attempt = requiredInteger(object.attempt, `${context}.attempt`);
	const reason = requiredString(object.reason, `${context}.reason`);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	return { gate, status, attempt, reason, updated_at: updatedAt };
}

function parseCompletionEvidence(value: unknown, taskId: string, context: string): TeamCompletionEvidence | undefined {
	if (value === undefined) return undefined;
	const object = persistedObject(value, context);
	const summary = requiredString(object.summary, `${context}.summary`);
	if (summary.trim().length < 16)
		throw new Error(`invalid persisted completion evidence for ${taskId}: summary is too short`);
	const files = optionalStringArray(object.files, `${context}.files`);
	const verification = optionalStringArray(object.verification, `${context}.verification`);
	const recordedBy = requiredString(object.recorded_by, `${context}.recorded_by`);
	const recordedAt = requiredTrimmedString(object.recorded_at, `${context}.recorded_at`);
	return {
		summary,
		...(files !== undefined ? { files } : {}),
		...(verification !== undefined ? { verification } : {}),
		recorded_by: recordedBy,
		recorded_at: recordedAt,
	};
}

export function parseTeamTask(raw: unknown, expectedId?: string): TeamTask {
	const object = persistedObject(raw, "team task");
	const id = requiredTrimmedString(object.id, "team task.id");
	assertSafeId("task_id", id);
	if (expectedId !== undefined && id !== expectedId) {
		throw new Error(`invalid persisted team task: id ${id} does not match path id ${expectedId}`);
	}
	const title = requiredString(object.title, `team task ${id}.title`);
	const description = requiredString(object.description, `team task ${id}.description`);
	const status = enumValue(object.status, TEAM_TASK_STATUSES, `team task ${id}.status`);
	const owner = optionalString(object.owner, `team task ${id}.owner`);
	const assignee = optionalString(object.assignee, `team task ${id}.assignee`);
	const dependsOn = optionalStringArray(object.depends_on, `team task ${id}.depends_on`);
	const blockedBy = optionalStringArray(object.blocked_by, `team task ${id}.blocked_by`);
	const reviewGate = parseReviewGate(object.review_gate, `team task ${id}.review_gate`);
	const gateEscalation = parseTaskGateEscalation(object.gate_escalation, `team task ${id}.gate_escalation`);
	const completionEvidence = parseCompletionEvidence(
		object.completion_evidence,
		id,
		`team task ${id}.completion_evidence`,
	);
	const execution = parseExecution(object.execution, `team task ${id}.execution`);
	const version = requiredInteger(object.version, `team task ${id}.version`, 1);
	const createdAt = requiredTrimmedString(object.created_at, `team task ${id}.created_at`);
	const updatedAt = requiredTrimmedString(object.updated_at, `team task ${id}.updated_at`);
	const completedAt =
		object.completed_at === undefined
			? undefined
			: requiredTrimmedString(object.completed_at, `team task ${id}.completed_at`);
	return {
		id,
		title,
		description,
		status,
		...(owner !== undefined ? { owner } : {}),
		...(assignee !== undefined ? { assignee } : {}),
		...(dependsOn !== undefined ? { depends_on: dependsOn } : {}),
		...(blockedBy !== undefined ? { blocked_by: blockedBy } : {}),
		...(reviewGate !== undefined ? { review_gate: reviewGate } : {}),
		...(gateEscalation !== undefined ? { gate_escalation: gateEscalation } : {}),
		...(completionEvidence !== undefined ? { completion_evidence: completionEvidence } : {}),
		...(execution !== undefined ? { execution } : {}),
		version,
		created_at: createdAt,
		updated_at: updatedAt,
		...(completedAt !== undefined ? { completed_at: completedAt } : {}),
	};
}

function parseWorker(raw: unknown, index: number): TeamWorker {
	const context = `team config.workers[${index}]`;
	const object = persistedObject(raw, context);
	const id = requiredTrimmedString(object.id, `${context}.id`);
	assertSafeId("worker_id", id);
	const name = requiredString(object.name, `${context}.name`);
	const role = requiredString(object.role, `${context}.role`);
	const status = enumValue(object.status, WORKER_STATUSES, `${context}.status`);
	const assignedTasks = requiredStringArray(object.assigned_tasks, `${context}.assigned_tasks`);
	const updatedAt = requiredTrimmedString(object.updated_at, `${context}.updated_at`);
	return { id, name, role, status, assigned_tasks: assignedTasks, updated_at: updatedAt };
}

export function parseTeamConfig(raw: unknown, expectedTeamId?: string): TeamConfig {
	const object = persistedObject(raw, "team config");
	const teamId = requiredTrimmedString(object.team_id, "team config.team_id");
	assertSafeId("team_id", teamId);
	if (expectedTeamId !== undefined && teamId !== expectedTeamId) {
		throw new Error(`invalid persisted team config: team_id ${teamId} does not match path id ${expectedTeamId}`);
	}
	const displayName = requiredString(object.display_name, `team config ${teamId}.display_name`);
	const task = requiredString(object.task, `team config ${teamId}.task`);
	const phase = enumValue(object.phase, TEAM_PHASES, `team config ${teamId}.phase`);
	if (!Array.isArray(object.workers))
		throw new Error(`invalid persisted team config ${teamId}.workers: expected an array`);
	const workers = object.workers.map((worker, index) => parseWorker(worker, index));
	const completionGate = parseCompletionGate(object.completion_gate, `team config ${teamId}.completion_gate`);
	const gateEscalation = parseCompletionGateEscalation(
		object.gate_escalation,
		`team config ${teamId}.gate_escalation`,
	);
	const createdAt = requiredTrimmedString(object.created_at, `team config ${teamId}.created_at`);
	const updatedAt = requiredTrimmedString(object.updated_at, `team config ${teamId}.updated_at`);
	return {
		team_id: teamId,
		display_name: displayName,
		task,
		phase,
		workers,
		...(completionGate !== undefined ? { completion_gate: completionGate } : {}),
		...(gateEscalation !== undefined ? { gate_escalation: gateEscalation } : {}),
		created_at: createdAt,
		updated_at: updatedAt,
	};
}

function normalizeInputList(value: readonly string[] | undefined, context: string): string[] | undefined {
	if (value === undefined) return undefined;
	const items = value.map((item, index) => requiredTrimmedString(item, `${context}[${index}]`));
	const unique = [...new Set(items)].sort();
	return unique.length > 0 ? unique : undefined;
}

export function createTeamTaskRecord(input: {
	id: string;
	title: string;
	description: string;
	owner?: string;
	depends_on?: readonly string[];
	created_at: string;
	updated_at: string;
}): TeamTask {
	assertSafeId("task_id", input.id);
	const dependsOn = normalizeInputList(input.depends_on, "team task depends_on");
	const title = requiredTrimmedString(input.title, "team task title");
	if (!input.description.trim()) throw new Error("team task description must not be empty");
	return {
		id: input.id,
		title,
		description: input.description,
		status: "pending",
		...(input.owner !== undefined ? { owner: requiredTrimmedString(input.owner, "team task owner") } : {}),
		...(dependsOn !== undefined ? { depends_on: dependsOn } : {}),
		version: 1,
		created_at: input.created_at,
		updated_at: input.updated_at,
	};
}

export function parseTeamTaskStatus(value: string): TeamTaskStatus {
	if (TEAM_TASK_STATUSES.includes(value as TeamTaskStatus)) return value as TeamTaskStatus;
	throw new Error(`invalid team task status: ${value}`);
}

export function createTeamCompletionEvidence(
	taskId: string,
	input: Omit<TeamCompletionEvidence, "recorded_at">,
	recordedAt = nowIso(),
): TeamCompletionEvidence {
	const summary = input.summary.trim();
	if (summary.length < 16) throw new Error(`invalid completion evidence for ${taskId}: summary is too short`);
	const files = normalizeInputList(input.files, "completion evidence files");
	const verification = normalizeInputList(input.verification, "completion evidence verification");
	return {
		summary,
		...(files !== undefined ? { files } : {}),
		...(verification !== undefined ? { verification } : {}),
		recorded_by: requiredTrimmedString(input.recorded_by, "completion evidence recorded_by"),
		recorded_at: recordedAt,
	};
}

export function emptyTaskCounts(): Record<TeamTaskStatus, number> {
	return { pending: 0, blocked: 0, in_progress: 0, completed: 0, failed: 0 };
}

export function countTeamTasks(tasks: readonly TeamTask[]): Record<TeamTaskStatus, number> {
	const counts = emptyTaskCounts();
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}
