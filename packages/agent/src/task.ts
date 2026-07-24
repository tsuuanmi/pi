// Architecture adapted from open-multi-agent (MIT).
import type { TaskInput, TaskSnapshot, TaskStatus } from "#agent/types";

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
			requires: [...(input.requires ?? [])],
			createdAt: now,
			updatedAt: now,
			...(input.assignee ? { assignee: input.assignee } : {}),
			...(input.metadata ? { metadata: { ...input.metadata } } : {}),
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
		return this.snapshotValue.requires;
	}

	assign(agentName: string): void {
		this.patch({ assignee: agentName });
	}

	start(): void {
		this.patch({ status: "in_progress" });
	}

	complete(result: string): void {
		this.patch({ status: "completed", result, error: undefined });
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
			...(this.snapshotValue.metadata ? { metadata: { ...this.snapshotValue.metadata } } : {}),
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
