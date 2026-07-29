import type { Task } from "#agent/task/task";
import type { TaskPriority, TaskSnapshot } from "#agent/task/types";
import type { RunTeamOptions, SchedulingStrategy, SchedulingWeights } from "../types.js";
import { AgentSelector } from "./agent-selector.js";
import { resolveSchedulingStrategy } from "./execution-router.js";

export interface SchedulerConfig {
	schedulingStrategy?: SchedulingStrategy;
	schedulingWeights?: Partial<SchedulingWeights>;
}

export class Scheduler {
	private readonly schedulingStrategy: SchedulingStrategy;
	private readonly selector: AgentSelector;

	constructor(config: SchedulerConfig = {}) {
		this.schedulingStrategy = config.schedulingStrategy ?? "dependency-first";
		this.selector = new AgentSelector({ weights: config.schedulingWeights });
	}

	resolveStrategy(options: RunTeamOptions): SchedulingStrategy {
		return resolveSchedulingStrategy(this.schedulingStrategy, options.schedulingStrategy);
	}

	assignReadyTasks(
		tasks: Task[],
		allTasks: readonly TaskSnapshot[],
		agents: readonly import("#agent/agent/agent").Agent[],
		options: RunTeamOptions,
	): Task[] {
		const available = [...agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const strategy = this.resolveStrategy(options);
		const ordered = this.orderTasks(tasks, allTasks, strategy);
		const load = currentLoad(available, allTasks);
		return ordered.map((task, index) => {
			const snapshot = task.snapshot();
			if (!snapshot.assignee) {
				const agent = this.selector.selectAgent(snapshot, available, allTasks, load, index, options, strategy);
				task.assign(agent.name);
				load.set(agent.name, (load.get(agent.name) ?? 0) + 1);
			}
			return task;
		});
	}

	private orderTasks(tasks: readonly Task[], allTasks: readonly TaskSnapshot[], strategy: SchedulingStrategy): Task[] {
		return [...tasks].sort((left, right) => {
			const priorityOrder = comparePriority(right.snapshot().priority, left.snapshot().priority);
			if (priorityOrder !== 0) return priorityOrder;
			if (strategy !== "dependency-first" && strategy !== "composite") {
				return left.id.localeCompare(right.id);
			}
			const dependencyOrder = countDependents(right.id, allTasks) - countDependents(left.id, allTasks);
			if (dependencyOrder !== 0) return dependencyOrder;
			return left.id.localeCompare(right.id);
		});
	}
}

function currentLoad(
	agents: readonly import("#agent/agent/agent").Agent[],
	allTasks: readonly TaskSnapshot[],
): Map<string, number> {
	const load = new Map<string, number>(agents.map((agent) => [agent.name, 0]));
	for (const task of allTasks) {
		if (task.status === "in_progress" && task.assignee && load.has(task.assignee)) {
			load.set(task.assignee, (load.get(task.assignee) ?? 0) + 1);
		}
	}
	return load;
}

function countDependents(taskId: string, allTasks: readonly TaskSnapshot[]): number {
	const seen = new Set<string>();
	const queue = [taskId];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const task of allTasks) {
			if (task.dependsOn.includes(current) && !seen.has(task.id)) {
				seen.add(task.id);
				queue.push(task.id);
			}
		}
	}
	return seen.size;
}

function comparePriority(left?: TaskPriority, right?: TaskPriority): number {
	return priorityRank(left) - priorityRank(right);
}

function priorityRank(priority?: TaskPriority): number {
	switch (priority) {
		case "critical":
			return 4;
		case "high":
			return 3;
		case "normal":
			return 2;
		case "low":
			return 1;
		default:
			return 2;
	}
}
