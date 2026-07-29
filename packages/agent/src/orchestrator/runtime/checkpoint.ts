import type { TaskQueueSnapshot } from "#agent/task/types";
import type { TaskExecutionMetrics } from "../types.js";
import { normalizeRunFacts, type RunFacts } from "./facts.js";
import { normalizeRunIdentity, type RunIdentity } from "./identity.js";
import { normalizeTaskExecutionReceipts, type TaskExecutionReceipt } from "./receipt.js";

export const CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION = 4;

export interface OrchestratorCheckpoint {
	version: typeof CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION;
	status: "running" | "completed" | "aborted";
	runIdentity: RunIdentity;
	runFacts: RunFacts;
	tasks: TaskQueueSnapshot;
	metrics: Readonly<Record<string, TaskExecutionMetrics>>;
	receipts: Readonly<Record<string, TaskExecutionReceipt>>;
	taskStarts: number;
	updatedAt: string;
	abortedReason?: string;
}

export interface OrchestratorCheckpointStore {
	load(): OrchestratorCheckpoint | Promise<OrchestratorCheckpoint | undefined> | undefined;
	save(checkpoint: OrchestratorCheckpoint): void | Promise<void>;
}

export function normalizeCheckpoint(checkpoint: unknown): OrchestratorCheckpoint {
	const input = asRecord(checkpoint, "Orchestrator checkpoint");
	const version = input.version;
	if (version !== CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION) {
		throw new Error(`Unsupported orchestrator checkpoint version: ${String(version)}`);
	}
	const status = normalizeStatus(input.status);
	const taskStarts = normalizeTaskStarts(input.taskStarts);
	const updatedAt = normalizeUpdatedAt(input.updatedAt);
	const runIdentity = normalizeRunIdentity(input.runIdentity);
	const runFacts = normalizeRunFacts(input.runFacts);
	const tasks = normalizeTaskQueueSnapshot(input.tasks);
	const metrics = normalizeMetrics(input.metrics);
	const receipts = normalizeTaskExecutionReceipts(input.receipts);
	const abortedReason = normalizeOptionalString(input.abortedReason, "abortedReason");
	if (status === "aborted" && abortedReason === undefined) {
		throw new Error("Aborted orchestrator checkpoints must include abortedReason.");
	}
	return {
		version: CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION,
		status,
		runIdentity,
		runFacts,
		tasks,
		metrics,
		receipts,
		taskStarts,
		updatedAt,
		...(abortedReason !== undefined ? { abortedReason } : {}),
	};
}

function normalizeStatus(value: unknown): OrchestratorCheckpoint["status"] {
	if (value === "running" || value === "completed" || value === "aborted") return value;
	throw new Error(`Invalid orchestrator checkpoint status: ${String(value)}`);
}

function normalizeTaskStarts(value: unknown): number {
	if (!Number.isFinite(value) || typeof value !== "number" || value < 0) {
		throw new Error("Orchestrator checkpoint taskStarts must be a finite non-negative number.");
	}
	return Math.floor(value);
}

function normalizeUpdatedAt(value: unknown): string {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
		throw new Error("Orchestrator checkpoint updatedAt must be a valid ISO timestamp string.");
	}
	return value;
}

function normalizeTaskQueueSnapshot(value: unknown): TaskQueueSnapshot {
	const snapshot = asRecord(value, "Orchestrator checkpoint tasks");
	if (snapshot.version !== 1)
		throw new Error(`Unsupported task queue checkpoint version: ${String(snapshot.version)}`);
	return {
		version: 1,
		tasks: normalizeTaskSnapshots(snapshot.tasks),
		pending: normalizeStringArray(snapshot.pending, "pending"),
		inProgress: normalizeStringArray(snapshot.inProgress, "inProgress"),
		completed: normalizeStringArray(snapshot.completed, "completed"),
		failed: normalizeStringArray(snapshot.failed, "failed"),
		blocked: normalizeStringArray(snapshot.blocked, "blocked"),
		skipped: normalizeStringArray(snapshot.skipped, "skipped"),
	};
}

function normalizeMetrics(value: unknown): Readonly<Record<string, TaskExecutionMetrics>> {
	const metrics = asRecord(value ?? {}, "Orchestrator checkpoint metrics");
	const normalized: Record<string, TaskExecutionMetrics> = {};
	for (const [taskId, rawMetric] of Object.entries(metrics)) {
		if (typeof taskId !== "string" || taskId.length === 0) {
			throw new Error("Orchestrator checkpoint metric keys must be non-empty task ids.");
		}
		const metric = asRecord(rawMetric, `Orchestrator checkpoint metric ${taskId}`);
		normalized[taskId] = {
			startedAt: normalizeUpdatedAt(metric.startedAt),
			completedAt: normalizeUpdatedAt(metric.completedAt),
			durationMs: normalizeNonNegativeNumber(metric.durationMs, "durationMs"),
			attempts: normalizeNonNegativeInteger(metric.attempts, "attempts"),
			retries: normalizeNonNegativeInteger(metric.retries, "retries"),
		};
	}
	return Object.freeze(normalized);
}

function normalizeTaskSnapshots(value: unknown): TaskQueueSnapshot["tasks"] {
	if (!Array.isArray(value)) throw new Error("Orchestrator checkpoint tasks must be an array.");
	for (const item of value) asRecord(item, "Orchestrator checkpoint task snapshot");
	return Object.freeze([...value]) as TaskQueueSnapshot["tasks"];
}

function normalizeStringArray(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value)) throw new Error(`Orchestrator checkpoint ${field} must be an array.`);
	for (const item of value) {
		if (typeof item !== "string") throw new Error(`Orchestrator checkpoint ${field} must contain only strings.`);
	}
	return Object.freeze([...value]);
}

function normalizeOptionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Orchestrator checkpoint ${field} must be a non-empty string when present.`);
	}
	return value;
}

function normalizeNonNegativeNumber(value: unknown, field: string): number {
	if (!Number.isFinite(value) || typeof value !== "number" || value < 0) {
		throw new Error(`Orchestrator checkpoint metric ${field} must be a finite non-negative number.`);
	}
	return value;
}

function normalizeNonNegativeInteger(value: unknown, field: string): number {
	return Math.floor(normalizeNonNegativeNumber(value, field));
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}
