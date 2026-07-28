// Architecture adapted from open-multi-agent (MIT).
import type { AgentRunResult } from "#agent/agent/runtime/types";
import type { DependencyPayload, TaskInput, TaskPriority, TaskSnapshot, TaskStatus } from "#agent/task/types";

export interface FormatTaskPromptOptions {
	task: TaskSnapshot;
	completedDependencies: readonly TaskSnapshot[];
}

export interface TaskBridgeResult {
	output: string;
	structured?: unknown;
}

let nextTaskId = 0;

function makeTaskId(): string {
	nextTaskId += 1;
	return `task-${nextTaskId}`;
}

export class Task {
	private snapshotValue: TaskSnapshot;

	constructor(input: TaskInput) {
		const now = new Date().toISOString();
		this.snapshotValue = {
			id: input.id ?? makeTaskId(),
			title: input.title,
			description: input.description,
			status: "pending",
			dependsOn: [...(input.dependsOn ?? [])],
			memoryScope: input.memoryScope,
			dependencyPayload: input.dependencyPayload,
			role: input.role,
			priority: input.priority,
			metadata: input.metadata ? { ...input.metadata } : undefined,
			maxRetries: input.maxRetries,
			retryDelayMs: input.retryDelayMs,
			retryBackoff: input.retryBackoff,
			requires: [...(input.requires ?? [])],
			verify: input.verify ? { ...input.verify } : undefined,
			attempts: 0,
			createdAt: now,
			updatedAt: now,
			...(input.assignee ? { assignee: input.assignee } : {}),
		};
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
		return this.snapshotValue.requires ?? [];
	}
	get priority(): TaskPriority | undefined {
		return this.snapshotValue.priority;
	}

	assign(agentName: string): void {
		this.patch({ assignee: agentName });
	}

	start(): void {
		this.patch({ status: "in_progress", attempts: this.snapshotValue.attempts + 1, error: undefined });
	}

	retry(error: string): void {
		this.patch({ status: "pending", error });
	}

	complete(result: string, structured?: unknown): void {
		this.patch({ status: "completed", result, structured, error: undefined });
	}

	fail(error: string): void {
		this.patch({ status: "failed", error });
	}

	block(reason: string): void {
		this.patch({ status: "blocked", error: reason });
	}

	snapshot(): TaskSnapshot {
		return {
			...this.snapshotValue,
			dependsOn: [...this.snapshotValue.dependsOn],
			requires: [...this.snapshotValue.requires],
			metadata: this.snapshotValue.metadata ? { ...this.snapshotValue.metadata } : undefined,
			verify: this.snapshotValue.verify ? { ...this.snapshotValue.verify } : undefined,
		};
	}

	private patch(update: Partial<TaskSnapshot>): void {
		this.snapshotValue = {
			...this.snapshotValue,
			...update,
			updatedAt: new Date().toISOString(),
		};
	}
}

function formatDependencyPayload(dependency: TaskSnapshot, payload: DependencyPayload): string {
	const lines = [`- ${dependency.id}: ${dependency.title}`];
	if (payload === "output" || payload === "both") {
		lines.push(`  Output: ${dependency.result ?? ""}`);
	}
	if ((payload === "structured" || payload === "both") && dependency.structured !== undefined) {
		lines.push(`  Structured: ${JSON.stringify(dependency.structured)}`);
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
	const metadataBlock = task.metadata ? `\nMetadata:\n${JSON.stringify(task.metadata, null, 2)}\n` : "";
	const requirementBlock =
		task.requires && task.requires.length > 0 ? `\nRequirements:\n- ${task.requires.join("\n- ")}` : "";
	const verifyBlock = task.verify ? `\nVerify:\n${JSON.stringify(task.verify, null, 2)}` : "";
	return [
		...formatHeaderLines(task),
		"",
		"Description:",
		task.description,
		metadataBlock.trimEnd(),
		requirementBlock.trimEnd(),
		verifyBlock.trimEnd(),
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

	add(input: TaskInput | Task): Task {
		const task = input instanceof Task ? input : new Task(input);
		if (this.tasks.has(task.id)) throw new Error(`Task already exists: ${task.id}`);
		this.tasks.set(task.id, task);
		return task;
	}

	get(id: string): Task | undefined {
		return this.tasks.get(id);
	}

	list(): Task[] {
		return [...this.tasks.values()];
	}

	snapshots(): TaskSnapshot[] {
		return this.list().map((task) => task.snapshot());
	}

	ready(): Task[] {
		return this.list().filter((task) => {
			const snapshot = task.snapshot();
			return (
				snapshot.status === "pending" &&
				snapshot.dependsOn.every((id) => this.tasks.get(id)?.status === "completed")
			);
		});
	}

	blockImpossible(): void {
		for (const task of this.list()) {
			const snapshot = task.snapshot();
			if (snapshot.status !== "pending") continue;
			const failedDependency = snapshot.dependsOn.find((id) => {
				const dependency = this.tasks.get(id);
				return !dependency || dependency.status === "failed" || dependency.status === "blocked";
			});
			if (failedDependency) task.block(`Dependency is not completable: ${failedDependency}`);
		}
	}
}
