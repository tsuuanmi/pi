// Architecture adapted from open-multi-agent (MIT).
import { randomUUID } from "node:crypto";
import type { AgentRunResult } from "@tsuuanmi/pi-agent";
import { validateTaskMetadata } from "#orchestrator/task/metadata";
import type {
	DependencyPayload,
	TaskInput,
	TaskMetadata,
	TaskPriority,
	TaskQueueSnapshot,
	TaskSnapshot,
	TaskStatus,
	TaskVerifyOptions,
} from "#orchestrator/task/types";

const MAX_FORMATTED_BLOCK_LENGTH = 12_000;
const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "failed", "blocked", "skipped"];
const TASK_MEMORY_SCOPES = ["dependencies", "all"] as const;
const DEPENDENCY_PAYLOADS = ["output", "structured", "both"] as const;
const TASK_PRIORITIES: readonly TaskPriority[] = ["low", "normal", "high", "critical"];
const TERMINAL_STATUSES = new Set<TaskStatus>(["completed", "failed", "blocked", "skipped"]);

export interface FormatTaskPromptOptions {
	task: TaskSnapshot;
	completedDependencies: readonly TaskSnapshot[];
}

export interface TaskBridgeResult {
	output: string;
	structured?: unknown;
}

export interface TaskDependencyValidationResult {
	valid: boolean;
	errors: readonly string[];
}

export interface TaskQueueProgress {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
	failed: number;
	blocked: number;
	skipped: number;
}

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

function stringifyBounded(value: unknown): string {
	try {
		return truncateText(JSON.stringify(value, null, 2));
	} catch {
		return "[unserializable value]";
	}
}

function snapshotOf(task: Task | TaskSnapshot): TaskSnapshot {
	return task instanceof Task ? task.snapshot() : task;
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
			requires: normalizeStringList(input.requires, "requires"),
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
	get status(): TaskStatus {
		return this.snapshotValue.status;
	}
	get assignee(): string | undefined {
		return this.snapshotValue.assignee;
	}
	get dependsOn(): readonly string[] {
		return this.snapshotValue.dependsOn;
	}
	get requires(): readonly string[] {
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
			requires: [...this.snapshotValue.requires],
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

export function isTaskReady(task: Task | TaskSnapshot, allTasks: readonly (Task | TaskSnapshot)[]): boolean {
	const snapshot = snapshotOf(task);
	if (snapshot.status !== "pending") return false;
	if (snapshot.dependsOn.length === 0) return true;
	const taskById = new Map(
		allTasks.map((candidate) => {
			const candidateSnapshot = snapshotOf(candidate);
			return [candidateSnapshot.id, candidateSnapshot] as const;
		}),
	);
	return snapshot.dependsOn.every((id) => taskById.get(id)?.status === "completed");
}

export function getTaskDependencyOrder(tasks: readonly Task[]): Task[] {
	if (tasks.length === 0) return [];
	const validation = validateTaskDependencies(tasks);
	if (!validation.valid) throw new Error(`Invalid task dependency graph:\n${validation.errors.join("\n")}`);
	const taskById = new Map(tasks.map((task) => [task.id, task]));
	const inDegree = new Map<string, number>();
	const successors = new Map<string, string[]>();

	for (const task of tasks) {
		inDegree.set(task.id, inDegree.get(task.id) ?? 0);
		successors.set(task.id, successors.get(task.id) ?? []);
		for (const depId of task.dependsOn) {
			if (!taskById.has(depId)) continue;
			inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
			successors.get(depId)!.push(task.id);
		}
	}

	const queue = [...inDegree.entries()]
		.filter(([, degree]) => degree === 0)
		.map(([id]) => id)
		.sort();
	const ordered: Task[] = [];
	while (queue.length > 0) {
		const id = queue.shift()!;
		const task = taskById.get(id);
		if (task) ordered.push(task);
		for (const successorId of successors.get(id) ?? []) {
			const nextDegree = (inDegree.get(successorId) ?? 0) - 1;
			inDegree.set(successorId, nextDegree);
			if (nextDegree === 0) queue.push(successorId);
		}
		queue.sort();
	}
	return ordered;
}

export function validateTaskDependencies(tasks: readonly (Task | TaskSnapshot)[]): TaskDependencyValidationResult {
	const snapshots = tasks.map(snapshotOf);
	const taskById = new Map<string, TaskSnapshot>();
	const errors: string[] = [];
	for (const task of snapshots) {
		if (taskById.has(task.id)) errors.push(`Duplicate task id: ${task.id}`);
		taskById.set(task.id, task);
	}

	for (const task of snapshots) {
		for (const depId of task.dependsOn) {
			if (depId === task.id) {
				errors.push(`Task "${task.title}" (${task.id}) depends on itself.`);
				continue;
			}
			if (!taskById.has(depId)) {
				errors.push(`Task "${task.title}" (${task.id}) references unknown dependency "${depId}".`);
			}
		}
	}

	const colour = new Map<string, 0 | 1 | 2>(snapshots.map((task) => [task.id, 0]));
	const visit = (id: string, path: readonly string[]): void => {
		if (colour.get(id) === 2) return;
		if (colour.get(id) === 1) {
			const cycleStart = path.indexOf(id);
			const cycle = [...path.slice(cycleStart), id];
			errors.push(`Cyclic dependency detected: ${cycle.join(" -> ")}`);
			return;
		}
		colour.set(id, 1);
		const task = taskById.get(id);
		for (const depId of task?.dependsOn ?? []) {
			if (taskById.has(depId)) visit(depId, [...path, id]);
		}
		colour.set(id, 2);
	};
	for (const task of snapshots) {
		if (colour.get(task.id) === 0) visit(task.id, []);
	}

	return { valid: errors.length === 0, errors };
}

function formatDependencyPayload(dependency: TaskSnapshot, payload: DependencyPayload): string {
	const lines = [`- ${dependency.id}: ${dependency.title}`];
	if (payload === "output" || payload === "both") {
		lines.push(`  Output: ${truncateText(dependency.result ?? "")}`);
	}
	if ((payload === "structured" || payload === "both") && dependency.structured !== undefined) {
		lines.push(`  Structured: ${stringifyBounded(dependency.structured)}`);
	}
	return lines.join("\n");
}

function formatHeaderLines(task: TaskSnapshot): string[] {
	const lines = [`Task: ${task.title}`];
	if (task.role) lines.push(`Role: ${task.role}`);
	if (task.priority) lines.push(`Priority: ${task.priority}`);
	if (task.memoryScope) lines.push(`Memory scope: ${task.memoryScope}`);
	if (task.attempts > 1) lines.push(`Attempt: ${task.attempts}`);
	return lines;
}

export function formatTaskPrompt({ task, completedDependencies }: FormatTaskPromptOptions): string {
	const payload = task.dependencyPayload ?? "output";
	const dependencyBlock = completedDependencies.length
		? completedDependencies.map((dependency) => formatDependencyPayload(dependency, payload)).join("\n")
		: "None";
	const metadataBlock = task.metadata ? `Metadata:\n${stringifyBounded(validateTaskMetadata(task.metadata))}` : "";
	const requirementBlock = task.requires.length > 0 ? `Requirements:\n- ${task.requires.join("\n- ")}` : "";
	return [
		...formatHeaderLines(task),
		"",
		"Description:",
		truncateText(task.description),
		metadataBlock,
		requirementBlock,
		"",
		"Completed dependencies:",
		dependencyBlock,
		"",
		"Return the task result clearly and concisely.",
	]
		.filter((part) => part.length > 0)
		.join("\n");
}

export function extractTaskBridgeResult(result: AgentRunResult): TaskBridgeResult {
	return {
		output: result.output,
		...(result.structured !== undefined ? { structured: result.structured } : {}),
	};
}

export class TaskQueue {
	private readonly tasks = new Map<string, Task>();

	static fromSnapshot(snapshot: TaskQueueSnapshot, options: { readonly resetInProgress?: boolean } = {}): TaskQueue {
		if (snapshot.version !== 1) {
			throw new Error(`TaskQueue.fromSnapshot: unsupported snapshot version ${String(snapshot.version)}.`);
		}
		validateQueueSnapshotPartitions(snapshot);
		const queue = new TaskQueue();
		const tasks = snapshot.tasks.map((taskSnapshot) => {
			const restored = Task.fromSnapshot(taskSnapshot);
			if (options.resetInProgress && restored.status === "in_progress")
				restored.retry("Restored from interrupted run.");
			return restored;
		});
		queue.addBatch(tasks);
		return queue;
	}

	add(input: TaskInput | Task): Task {
		const task = input instanceof Task ? input : new Task(input);
		if (this.tasks.has(task.id)) throw new Error(`Task already exists: ${task.id}`);
		const validation = validateTaskDependencies([...this.list(), task]);
		if (!validation.valid) throw new Error(`Invalid task dependency graph:\n${validation.errors.join("\n")}`);
		this.tasks.set(task.id, task);
		return task;
	}

	addBatch(inputs: readonly (TaskInput | Task)[]): readonly Task[] {
		const tasks = inputs.map((input) => (input instanceof Task ? input : new Task(input)));
		for (const task of tasks) {
			if (this.tasks.has(task.id)) throw new Error(`Task already exists: ${task.id}`);
		}
		const validation = validateTaskDependencies([...this.list(), ...tasks]);
		if (!validation.valid) throw new Error(`Invalid task dependency graph:\n${validation.errors.join("\n")}`);
		for (const task of tasks) this.tasks.set(task.id, task);
		return tasks;
	}

	get(id: string): Task | undefined {
		return this.tasks.get(id);
	}

	list(): Task[] {
		return [...this.tasks.values()];
	}

	getByStatus(status: TaskStatus): Task[] {
		return this.list().filter((task) => task.status === status);
	}

	snapshots(): TaskSnapshot[] {
		return this.list().map((task) => task.snapshot());
	}

	snapshot(): TaskQueueSnapshot {
		const tasks = this.snapshots();
		return {
			version: 1,
			tasks,
			pending: idsWithStatus(tasks, "pending"),
			inProgress: idsWithStatus(tasks, "in_progress"),
			completed: idsWithStatus(tasks, "completed"),
			failed: idsWithStatus(tasks, "failed"),
			blocked: idsWithStatus(tasks, "blocked"),
			skipped: idsWithStatus(tasks, "skipped"),
		};
	}

	ready(): Task[] {
		const tasks = this.list();
		return tasks.filter((task) => isTaskReady(task, tasks));
	}

	next(assignee?: string): Task | undefined {
		const ready = this.ready();
		return assignee ? ready.find((task) => task.assignee === assignee) : ready[0];
	}

	isComplete(): boolean {
		return this.list().every((task) => TERMINAL_STATUSES.has(task.status));
	}

	getProgress(): TaskQueueProgress {
		const progress: TaskQueueProgress = {
			total: this.tasks.size,
			pending: 0,
			inProgress: 0,
			completed: 0,
			failed: 0,
			blocked: 0,
			skipped: 0,
		};
		for (const task of this.tasks.values()) {
			switch (task.status) {
				case "pending":
					progress.pending += 1;
					break;
				case "in_progress":
					progress.inProgress += 1;
					break;
				case "completed":
					progress.completed += 1;
					break;
				case "failed":
					progress.failed += 1;
					break;
				case "blocked":
					progress.blocked += 1;
					break;
				case "skipped":
					progress.skipped += 1;
					break;
			}
		}
		return progress;
	}

	blockImpossible(): void {
		let changed = true;
		while (changed) {
			changed = false;
			for (const task of this.list()) {
				if (task.status !== "pending" && task.status !== "in_progress") continue;
				const blockedDependency = task.dependsOn.find((id) => {
					const dependency = this.tasks.get(id);
					return (
						!dependency ||
						dependency.status === "failed" ||
						dependency.status === "blocked" ||
						dependency.status === "skipped"
					);
				});
				if (blockedDependency) {
					task.block(`Dependency is not completable: ${blockedDependency}`);
					changed = true;
				}
			}
		}
	}
}

function idsWithStatus(tasks: readonly TaskSnapshot[], status: TaskStatus): readonly string[] {
	return Object.freeze(tasks.filter((task) => task.status === status).map((task) => task.id));
}

function validateQueueSnapshotPartitions(snapshot: TaskQueueSnapshot): void {
	const tasks = snapshot.tasks.map((task) => ({ ...task, status: normalizeStatus(task.status) }));
	const expected = {
		pending: idsWithStatus(tasks, "pending"),
		inProgress: idsWithStatus(tasks, "in_progress"),
		completed: idsWithStatus(tasks, "completed"),
		failed: idsWithStatus(tasks, "failed"),
		blocked: idsWithStatus(tasks, "blocked"),
		skipped: idsWithStatus(tasks, "skipped"),
	};
	for (const [key, value] of Object.entries(expected)) {
		const actual = snapshot[key as keyof typeof expected];
		if (!sameStringSet(actual, value)) throw new Error(`TaskQueue snapshot ${key} partition does not match tasks.`);
	}
}

function sameStringSet(left: unknown, right: readonly string[]): boolean {
	if (!Array.isArray(left) || left.some((value) => typeof value !== "string")) return false;
	if (left.length !== right.length) return false;
	const normalizedLeft = [...left].sort();
	const normalizedRight = [...right].sort();
	return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
