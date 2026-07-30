import type { TaskRoutingDecision } from "#orchestrator/routing/routing";
import type { TaskSnapshot, TaskStatus } from "#orchestrator/task/types";
import type { TaskRetryClassification } from "#orchestrator/types";

export interface TaskConsequentialReceipt {
	required: boolean;
	approved: boolean;
}

export interface TaskExecutionReceipt {
	receiptId: string;
	runId: string;
	taskId: string;
	taskTitle: string;
	agent?: string;
	status: TaskStatus;
	attempts: number;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	routing?: TaskRoutingDecision;
	retryCount: number;
	retryClassification?: TaskRetryClassification;
	verified?: boolean;
	consequential?: TaskConsequentialReceipt;
	error?: string;
}

export interface CreateTaskExecutionReceiptInput {
	runId: string;
	task: TaskSnapshot;
	startedAtMs: number;
	completedAtMs: number;
	routing?: TaskRoutingDecision;
	retryClassification?: TaskRetryClassification;
	verified?: boolean;
	consequential?: TaskConsequentialReceipt;
}

export function createTaskExecutionReceipt(input: CreateTaskExecutionReceiptInput): TaskExecutionReceipt {
	const startedAt = new Date(input.startedAtMs).toISOString();
	const completedAt = new Date(input.completedAtMs).toISOString();
	return Object.freeze({
		receiptId: `${input.runId}:${input.task.id}`,
		runId: input.runId,
		taskId: input.task.id,
		taskTitle: input.task.title,
		...(input.task.assignee !== undefined ? { agent: input.task.assignee } : {}),
		status: input.task.status,
		attempts: input.task.attempts,
		startedAt,
		completedAt,
		durationMs: Math.max(0, input.completedAtMs - input.startedAtMs),
		...(input.routing !== undefined ? { routing: input.routing } : {}),
		retryCount: Math.max(0, input.task.attempts - 1),
		...(input.retryClassification !== undefined ? { retryClassification: input.retryClassification } : {}),
		...(input.verified !== undefined ? { verified: input.verified } : {}),
		...(input.consequential !== undefined ? { consequential: input.consequential } : {}),
		...(input.task.error !== undefined ? { error: input.task.error } : {}),
	});
}

export function normalizeTaskExecutionReceipts(value: unknown): Readonly<Record<string, TaskExecutionReceipt>> {
	const receipts = asRecord(value, "Orchestrator checkpoint receipts");
	const normalized: Record<string, TaskExecutionReceipt> = {};
	for (const [taskId, rawReceipt] of Object.entries(receipts)) {
		if (typeof taskId !== "string" || taskId.length === 0) {
			throw new Error("Orchestrator checkpoint receipt keys must be non-empty task ids.");
		}
		const receipt = normalizeTaskExecutionReceipt(rawReceipt, taskId);
		normalized[taskId] = receipt;
	}
	return Object.freeze(normalized);
}

function normalizeTaskExecutionReceipt(value: unknown, taskId: string): TaskExecutionReceipt {
	const receipt = asRecord(value, `Orchestrator checkpoint receipt ${taskId}`);
	const normalizedTaskId = stringField(receipt.taskId, "taskId");
	if (normalizedTaskId !== taskId) throw new Error(`Orchestrator checkpoint receipt task id mismatch: ${taskId}.`);
	return Object.freeze({
		receiptId: stringField(receipt.receiptId, "receiptId"),
		runId: stringField(receipt.runId, "runId"),
		taskId: normalizedTaskId,
		taskTitle: stringField(receipt.taskTitle, "taskTitle"),
		...(receipt.agent !== undefined ? { agent: stringField(receipt.agent, "agent") } : {}),
		status: taskStatusField(receipt.status),
		attempts: nonNegativeIntegerField(receipt.attempts, "attempts"),
		startedAt: timestampField(receipt.startedAt, "startedAt"),
		completedAt: timestampField(receipt.completedAt, "completedAt"),
		durationMs: nonNegativeNumberField(receipt.durationMs, "durationMs"),
		...(receipt.routing !== undefined ? { routing: normalizeRoutingDecision(receipt.routing) } : {}),
		retryCount: nonNegativeIntegerField(receipt.retryCount, "retryCount"),
		...(receipt.retryClassification !== undefined
			? { retryClassification: retryClassificationField(receipt.retryClassification) }
			: {}),
		...(receipt.verified !== undefined ? { verified: booleanField(receipt.verified, "verified") } : {}),
		...(receipt.consequential !== undefined
			? { consequential: normalizeConsequentialReceipt(receipt.consequential) }
			: {}),
		...(receipt.error !== undefined ? { error: stringField(receipt.error, "error") } : {}),
	});
}

function retryClassificationField(value: unknown): TaskRetryClassification {
	if (
		value === "transient" ||
		value === "capacity" ||
		value === "dependency" ||
		value === "policy" ||
		value === "unknown"
	) {
		return value;
	}
	throw new Error(`Orchestrator checkpoint receipt retry classification is invalid: ${String(value)}.`);
}

function normalizeRoutingDecision(value: unknown): TaskRoutingDecision {
	const routing = asRecord(value, "Orchestrator checkpoint receipt routing");
	return Object.freeze({
		taskId: stringField(routing.taskId, "routing.taskId"),
		taskTitle: stringField(routing.taskTitle, "routing.taskTitle"),
		agent: stringField(routing.agent, "routing.agent"),
		schedulingStrategy: schedulingStrategyField(routing.schedulingStrategy),
		score: nonNegativeNumberField(routing.score, "routing.score"),
		reasons: stringArrayField(routing.reasons, "routing.reasons"),
		candidates: scoreArrayField(routing.candidates, "routing.candidates"),
		rejected: rejectionArrayField(routing.rejected, "routing.rejected"),
	});
}

function scoreArrayField(value: unknown, label: string): TaskRoutingDecision["candidates"] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return Object.freeze(
		value.map((item, index) => {
			const score = asRecord(item, `${label}[${index}]`);
			return Object.freeze({
				agent: stringField(score.agent, `${label}[${index}].agent`),
				score: nonNegativeNumberField(score.score, `${label}[${index}].score`),
				reasons: stringArrayField(score.reasons, `${label}[${index}].reasons`),
			});
		}),
	);
}

function rejectionArrayField(value: unknown, label: string): TaskRoutingDecision["rejected"] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return Object.freeze(
		value.map((item, index) => {
			const rejection = asRecord(item, `${label}[${index}]`);
			return Object.freeze({
				agent: stringField(rejection.agent, `${label}[${index}].agent`),
				reasons: stringArrayField(rejection.reasons, `${label}[${index}].reasons`),
			});
		}),
	);
}

function stringArrayField(value: unknown, label: string): readonly string[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return Object.freeze(value.map((item, index) => stringField(item, `${label}[${index}]`)));
}

function normalizeConsequentialReceipt(value: unknown): TaskConsequentialReceipt {
	const consequential = asRecord(value, "Orchestrator checkpoint receipt consequential");
	return Object.freeze({
		required: booleanField(consequential.required, "consequential.required"),
		approved: booleanField(consequential.approved, "consequential.approved"),
	});
}

function taskStatusField(value: unknown): TaskStatus {
	if (
		value === "pending" ||
		value === "in_progress" ||
		value === "completed" ||
		value === "failed" ||
		value === "blocked" ||
		value === "skipped"
	) {
		return value;
	}
	throw new Error(`Orchestrator checkpoint receipt status is invalid: ${String(value)}.`);
}

function schedulingStrategyField(value: unknown): TaskRoutingDecision["schedulingStrategy"] {
	if (
		value === "round-robin" ||
		value === "least-busy" ||
		value === "dependency-first" ||
		value === "capability-match" ||
		value === "composite"
	) {
		return value;
	}
	throw new Error(`Orchestrator checkpoint receipt routing strategy is invalid: ${String(value)}.`);
}

function timestampField(value: unknown, field: string): string {
	const timestamp = stringField(value, field);
	if (Number.isNaN(Date.parse(timestamp)))
		throw new Error(`Orchestrator checkpoint receipt ${field} must be a valid ISO timestamp.`);
	return timestamp;
}

function stringField(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new Error(`Orchestrator checkpoint receipt ${field} must be a non-empty string.`);
	return value;
}

function booleanField(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") throw new Error(`Orchestrator checkpoint receipt ${field} must be a boolean.`);
	return value;
}

function nonNegativeNumberField(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`Orchestrator checkpoint receipt ${field} must be a finite non-negative number.`);
	}
	return value;
}

function nonNegativeIntegerField(value: unknown, field: string): number {
	return Math.floor(nonNegativeNumberField(value, field));
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error(`${label} must be an object.`);
	return value as Record<string, unknown>;
}
