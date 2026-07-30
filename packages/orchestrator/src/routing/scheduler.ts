import type { Agent } from "@tsuuanmi/pi-agent";
import { type AgentSelection, AgentSelectionError, AgentSelector } from "#orchestrator/routing/agent-selector";
import { resolveSchedulingStrategy } from "#orchestrator/routing/execution-router";
import type { Task } from "#orchestrator/task/task";
import type { TaskPriority, TaskSnapshot } from "#orchestrator/task/types";
import type { RunTeamOptions, SchedulingStrategy, SchedulingWeights } from "#orchestrator/types";

export interface SchedulerConfig {
	schedulingStrategy?: SchedulingStrategy;
	schedulingWeights?: Partial<SchedulingWeights>;
}

export interface ScheduleTaskInput {
	task: Task;
	allTasks: readonly TaskSnapshot[];
	agents: readonly Agent[];
	options: RunTeamOptions;
	index?: number;
}

export interface ScheduledTask {
	task: Task;
	selection: AgentSelection;
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

	scheduleTask(input: ScheduleTaskInput): ScheduledTask {
		const load = currentLoad(input.agents, input.allTasks);
		return this.selectTask(input, load, input.index ?? 0);
	}

	assignReadyTasks(
		tasks: Task[],
		allTasks: readonly TaskSnapshot[],
		agents: readonly Agent[],
		options: RunTeamOptions,
	): ScheduledTask[] {
		const available = [...agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const strategy = this.resolveStrategy(options);
		const ordered = this.orderTasks(tasks, allTasks, strategy);
		const load = currentLoad(available, allTasks);
		return ordered.map((task, index) =>
			this.selectTask({ task, allTasks, agents: available, options, index }, load, index),
		);
	}

	private selectTask(input: ScheduleTaskInput, load: Map<string, number>, index: number): ScheduledTask {
		const available = [...input.agents];
		if (available.length === 0) throw new Error("Cannot run a team without agents.");
		const strategy = this.resolveStrategy(input.options);
		const snapshot = input.task.snapshot();
		const candidates = snapshot.assignee ? [requireAgent(snapshot.assignee, available)] : available;
		let selection: AgentSelection;
		try {
			selection = this.selector.select(snapshot, candidates, input.allTasks, load, index, input.options, strategy);
		} catch (error) {
			if (error instanceof AgentSelectionError) {
				input.options.onSchedulingWarning?.({
					code: "no_eligible_agent",
					message: error.message,
					taskId: error.taskId,
					taskTitle: error.taskTitle,
					rejected: error.rejected,
				});
			}
			throw error;
		}
		if (!snapshot.assignee) input.task.assign(selection.agent.name);
		load.set(selection.agent.name, (load.get(selection.agent.name) ?? 0) + 1);
		return { task: input.task, selection };
	}

	private orderTasks(tasks: readonly Task[], allTasks: readonly TaskSnapshot[], strategy: SchedulingStrategy): Task[] {
		return [...tasks].sort((left, right) => {
			const priorityOrder = comparePriority(right.snapshot().priority, left.snapshot().priority);
			if (priorityOrder !== 0) return priorityOrder;
			if (strategy !== "dependency-first" && strategy !== "composite") return left.id.localeCompare(right.id);
			const dependencyOrder = countDependents(right.id, allTasks) - countDependents(left.id, allTasks);
			if (dependencyOrder !== 0) return dependencyOrder;
			return left.id.localeCompare(right.id);
		});
	}
}

function requireAgent(name: string, agents: readonly Agent[]): Agent {
	const agent = agents.find((candidate) => candidate.name === name);
	if (!agent) throw new Error(`Assigned agent "${name}" is not in the team.`);
	return agent;
}

function currentLoad(agents: readonly Agent[], allTasks: readonly TaskSnapshot[]): Map<string, number> {
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
