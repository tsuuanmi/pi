import { isTaskReady, validateTaskDependencies } from "#orchestrator/task/dependencies";
import { Task } from "#orchestrator/task/task";
import type {
	TaskInput,
	TaskQueueEvent,
	TaskQueueProgress,
	TaskQueueSnapshot,
	TaskSnapshot,
	TaskStatus,
} from "#orchestrator/task/types";

const TASK_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "completed", "failed", "blocked", "skipped"];
const TERMINAL_STATUSES = new Set<TaskStatus>(["completed", "failed", "blocked", "skipped"]);

function normalizeStatus(value: unknown): TaskStatus {
	if (typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus)) return value as TaskStatus;
	throw new Error(`Invalid task status: ${String(value)}`);
}

export class TaskQueue {
	private readonly tasks = new Map<string, Task>();
	private readonly listeners = new Set<(event: TaskQueueEvent) => void>();

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

	subscribe(listener: (event: TaskQueueEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	emit(event: Omit<TaskQueueEvent, "timestamp">): void {
		const payload = Object.freeze({ ...event, timestamp: new Date().toISOString() } satisfies TaskQueueEvent);
		for (const listener of this.listeners) listener(payload);
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
					this.emit({ type: "task_block", task: task.snapshot(), message: blockedDependency });
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
