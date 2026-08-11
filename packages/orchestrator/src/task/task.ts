// Architecture adapted from open-multi-agent (MIT).
import { randomUUID } from "node:crypto";
import { validateTaskMetadata } from "#orchestrator/task/metadata";
import { cloneRequirements, normalizeRequirements } from "#orchestrator/task/requirements";
import type {
	TaskInput,
	TaskMetadata,
	TaskPriority,
	TaskRequirements,
	TaskSnapshot,
	TaskStatus,
	TaskVerifyOptions,
} from "#orchestrator/task/types";

const MAX_FORMATTED_BLOCK_LENGTH = 12_000;
const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "failed", "blocked", "skipped"];
const TASK_MEMORY_SCOPES = ["dependencies", "all"] as const;
const DEPENDENCY_PAYLOADS = ["output", "structured", "both"] as const;
const TASK_PRIORITIES: readonly TaskPriority[] = ["low", "normal", "high", "critical"];

function nowIso(): string {
	return new Date().toISOString();
}

function requireNonEmptyString(value: string | undefined, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (value.trim().length === 0) throw new Error(`Task ${field} must be a non-empty string.`);
	return value;
}

function normalizeId(value: string | undefined): string {
	return requireNonEmptyString(value, "id") ?? randomUUID();
}

function normalizeEnum<T extends string>(value: T | undefined, field: string, allowed: readonly T[]): T | undefined {
	if (value === undefined) return undefined;
	if (!allowed.includes(value)) throw new Error(`Task ${field} must be one of: ${allowed.join(", ")}.`);
	return value;
}

function normalizeStatus(value: unknown): TaskStatus {
	if (typeof value !== "string" || !TASK_STATUSES.includes(value as TaskStatus)) {
		throw new Error(`Task snapshot status must be one of: ${TASK_STATUSES.join(", ")}.`);
	}
	return value as TaskStatus;
}

function normalizeStringList(values: readonly string[] | undefined, field: string): readonly string[] {
	if (values === undefined) return [];
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const item = requireNonEmptyString(value, field);
		if (!item) continue;
		if (seen.has(item)) throw new Error(`Task ${field} contains duplicate value: ${item}`);
		seen.add(item);
		normalized.push(item);
	}
	return Object.freeze(normalized);
}

function normalizeOptionalInteger(value: number | undefined, field: string, minimum: number): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < minimum) throw new Error(`Task ${field} must be an integer >= ${minimum}.`);
	return value;
}

function normalizeOptionalNumber(value: number | undefined, field: string, minimum: number): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value) || value < minimum)
		throw new Error(`Task ${field} must be a finite number >= ${minimum}.`);
	return value;
}

function normalizeOptionalBoolean(value: boolean | undefined, field: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error(`Task ${field} must be a boolean.`);
	return value;
}

function cloneTaskMetadata(metadata: TaskMetadata | undefined): TaskMetadata | undefined {
	return validateTaskMetadata(metadata);
}

function cloneVerifyOptions(verify: TaskVerifyOptions | undefined): TaskVerifyOptions | undefined {
	if (verify === undefined) return undefined;
	return Object.freeze(cloneStructuredValue(verify, "Task verify options"));
}

function cloneStructuredValue<T>(value: T, field: string): T {
	if (value === undefined) return value;
	try {
		return structuredClone(value);
	} catch (error) {
		throw new Error(`${field} must be structured-cloneable.`, { cause: error });
	}
}

function requireOptionalString(value: string | undefined, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new Error(`Task snapshot ${field} must be a string.`);
	return value;
}

function truncateText(value: string, limit = MAX_FORMATTED_BLOCK_LENGTH): string {
	if (value.length <= limit) return value;
	return `${value.slice(0, limit)}\n[truncated ${value.length - limit} characters]`;
}

export class Task {
	private snapshotValue: TaskSnapshot;

	constructor(input: TaskInput) {
		const now = nowIso();
		const id = normalizeId(input.id);
		const dependsOn = normalizeStringList(input.dependsOn, "dependsOn");
		if (dependsOn.includes(id)) throw new Error(`Task "${id}" cannot depend on itself.`);
		this.snapshotValue = Object.freeze({
			id,
			title: requireNonEmptyString(input.title, "title")!,
			description: requireNonEmptyString(input.description, "description")!,
			status: "pending",
			dependsOn,
			memoryScope: normalizeEnum(input.memoryScope, "memoryScope", TASK_MEMORY_SCOPES),
			dependencyPayload: normalizeEnum(input.dependencyPayload, "dependencyPayload", DEPENDENCY_PAYLOADS),
			role: requireNonEmptyString(input.role, "role"),
			priority: normalizeEnum(input.priority, "priority", TASK_PRIORITIES),
			metadata: cloneTaskMetadata(input.metadata),
			maxRetries: normalizeOptionalInteger(input.maxRetries, "maxRetries", 0),
			retryDelayMs: normalizeOptionalInteger(input.retryDelayMs, "retryDelayMs", 0),
			retryBackoff: normalizeOptionalNumber(input.retryBackoff, "retryBackoff", 1),
			requires: normalizeRequirements(input.requires),
			verify: cloneVerifyOptions(input.verify),
			consequential: normalizeOptionalBoolean(input.consequential, "consequential"),
			attempts: 0,
			createdAt: now,
			updatedAt: now,
			...(input.assignee ? { assignee: requireNonEmptyString(input.assignee, "assignee") } : {}),
		});
	}

	static fromSnapshot(snapshot: TaskSnapshot): Task {
		const task = new Task({
			id: snapshot.id,
			title: snapshot.title,
			description: snapshot.description,
			assignee: snapshot.assignee,
			dependsOn: snapshot.dependsOn,
			memoryScope: snapshot.memoryScope,
			dependencyPayload: snapshot.dependencyPayload,
			role: snapshot.role,
			priority: snapshot.priority,
			metadata: snapshot.metadata,
			maxRetries: snapshot.maxRetries,
			retryDelayMs: snapshot.retryDelayMs,
			retryBackoff: snapshot.retryBackoff,
			requires: snapshot.requires,
			verify: snapshot.verify,
			consequential: snapshot.consequential,
		});
		task.snapshotValue = Object.freeze({
			...task.snapshot(),
			status: normalizeStatus(snapshot.status),
			result: requireOptionalString(snapshot.result, "result"),
			structured: cloneStructuredValue(snapshot.structured, "Task snapshot structured value"),
			error: requireOptionalString(snapshot.error, "error"),
			attempts: normalizeOptionalInteger(snapshot.attempts, "attempts", 0) ?? 0,
			createdAt: requireValidIsoDate(snapshot.createdAt, "createdAt"),
			updatedAt: requireValidIsoDate(snapshot.updatedAt, "updatedAt"),
		});
		return task;
	}

	get id(): string {
		return this.snapshotValue.id;
	}
	get title(): string {
		return this.snapshotValue.title;
	}
	get status(): TaskStatus {
		return this.snapshotValue.status;
	}
	get assignee(): string | undefined {
		return this.snapshotValue.assignee;
	}
	get dependsOn(): readonly string[] {
		return this.snapshotValue.dependsOn;
	}
	get requires(): TaskRequirements {
		return this.snapshotValue.requires;
	}
	get priority(): TaskPriority | undefined {
		return this.snapshotValue.priority;
	}

	assign(agentName: string): void {
		this.patch({ assignee: requireNonEmptyString(agentName, "assignee") });
	}

	start(): void {
		this.assertStatus(["pending"], "start");
		this.patch({ status: "in_progress", attempts: this.snapshotValue.attempts + 1, error: undefined });
	}

	retry(error: string): void {
		this.assertStatus(["in_progress", "failed"], "retry");
		this.patch({ status: "pending", error: truncateText(error) });
	}

	complete(result: string, structured?: unknown): void {
		this.assertStatus(["in_progress"], "complete");
		this.patch({
			status: "completed",
			result,
			structured: cloneStructuredValue(structured, "Task structured result"),
			error: undefined,
		});
	}

	fail(error: string): void {
		this.assertStatus(["pending", "in_progress"], "fail");
		this.patch({ status: "failed", error });
	}

	block(reason: string): void {
		if (this.status === "completed" || this.status === "failed" || this.status === "skipped") return;
		this.patch({ status: "blocked", error: reason });
	}

	skip(reason: string): void {
		if (this.status === "completed" || this.status === "failed" || this.status === "skipped") return;
		this.patch({ status: "skipped", error: reason });
	}

	snapshot(): TaskSnapshot {
		return {
			...this.snapshotValue,
			dependsOn: [...this.snapshotValue.dependsOn],
			requires: cloneRequirements(this.snapshotValue.requires),
			metadata: cloneTaskMetadata(this.snapshotValue.metadata),
			structured: cloneStructuredValue(this.snapshotValue.structured, "Task snapshot structured value"),
			verify: cloneVerifyOptions(this.snapshotValue.verify),
			consequential: this.snapshotValue.consequential,
		};
	}

	private assertStatus(allowed: readonly TaskStatus[], action: string): void {
		if (!allowed.includes(this.status)) {
			throw new Error(`Cannot ${action} task "${this.id}" while status is "${this.status}".`);
		}
	}

	private patch(update: Partial<TaskSnapshot>): void {
		this.snapshotValue = Object.freeze({
			...this.snapshotValue,
			...update,
			updatedAt: nowIso(),
		});
	}
}

function requireValidIsoDate(value: string, field: string): string {
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) throw new Error(`Task snapshot ${field} must be a valid ISO date.`);
	return new Date(timestamp).toISOString();
}
