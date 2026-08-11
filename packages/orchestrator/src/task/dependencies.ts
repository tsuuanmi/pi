import type { TaskStatus } from "#orchestrator/task/types";

export interface TaskDependencyNode {
	id: string;
	title: string;
	dependsOn: readonly string[];
}

export interface TaskDependencyState extends TaskDependencyNode {
	status: TaskStatus;
}

export interface TaskDependencyValidation {
	valid: boolean;
	errors: readonly string[];
}

export function isTaskReady(task: TaskDependencyState, tasks: readonly TaskDependencyState[]): boolean {
	if (task.status !== "pending") return false;
	const statusById = new Map(tasks.map((candidate) => [candidate.id, candidate.status]));
	return task.dependsOn.every((id) => statusById.get(id) === "completed");
}

export function getTaskDependencyOrder<T extends TaskDependencyNode>(tasks: readonly T[]): T[] {
	const validation = validateTaskDependencies(tasks);
	if (!validation.valid) throw new Error(`Invalid task dependency graph:\n${validation.errors.join("\n")}`);

	const taskById = new Map(tasks.map((task) => [task.id, task]));
	const degrees = new Map(tasks.map((task) => [task.id, 0]));
	const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));

	for (const task of tasks) {
		for (const dependencyId of task.dependsOn) {
			degrees.set(task.id, (degrees.get(task.id) ?? 0) + 1);
			successors.get(dependencyId)?.push(task.id);
		}
	}

	const ready = [...degrees.entries()]
		.filter(([, degree]) => degree === 0)
		.map(([id]) => id)
		.sort();
	const ordered: T[] = [];
	while (ready.length > 0) {
		const id = ready.shift();
		if (!id) break;
		const task = taskById.get(id);
		if (task) ordered.push(task);
		for (const successorId of successors.get(id) ?? []) {
			const degree = (degrees.get(successorId) ?? 0) - 1;
			degrees.set(successorId, degree);
			if (degree === 0) ready.push(successorId);
		}
		ready.sort();
	}
	return ordered;
}

export function validateTaskDependencies(tasks: readonly TaskDependencyNode[]): TaskDependencyValidation {
	const taskById = new Map<string, TaskDependencyNode>();
	const errors: string[] = [];
	for (const task of tasks) {
		if (taskById.has(task.id)) errors.push(`Duplicate task id: ${task.id}`);
		taskById.set(task.id, task);
	}

	for (const task of tasks) {
		for (const dependencyId of task.dependsOn) {
			if (dependencyId === task.id) {
				errors.push(`Task "${task.title}" (${task.id}) depends on itself.`);
				continue;
			}
			if (!taskById.has(dependencyId)) {
				errors.push(`Task "${task.title}" (${task.id}) references unknown dependency "${dependencyId}".`);
			}
		}
	}

	const colors = new Map<string, 0 | 1 | 2>(tasks.map((task) => [task.id, 0]));
	const visit = (id: string, path: readonly string[]): void => {
		if (colors.get(id) === 2) return;
		if (colors.get(id) === 1) {
			const start = path.indexOf(id);
			errors.push(`Cyclic dependency detected: ${[...path.slice(start), id].join(" -> ")}`);
			return;
		}
		colors.set(id, 1);
		for (const dependencyId of taskById.get(id)?.dependsOn ?? []) {
			if (taskById.has(dependencyId)) visit(dependencyId, [...path, id]);
		}
		colors.set(id, 2);
	};
	for (const task of tasks) {
		if (colors.get(task.id) === 0) visit(task.id, []);
	}

	return { valid: errors.length === 0, errors };
}
