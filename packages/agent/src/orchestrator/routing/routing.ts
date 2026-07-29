import type { Agent } from "#agent/agent/agent";
import type { Task } from "#agent/task/task";
import type { TaskSnapshot } from "#agent/task/types";
import type { RunTeamOptions, SchedulingStrategy } from "#agent/orchestrator/types";
import { createRoutingDecision } from "#agent/orchestrator/routing/execution-router";
import type { Scheduler } from "#agent/orchestrator/routing/scheduler";

export interface TaskRoutingDecision {
	taskId: string;
	taskTitle: string;
	agent: string;
	schedulingStrategy: SchedulingStrategy;
}

export interface RoutedTask {
	task: Task;
	decision: TaskRoutingDecision;
}

export interface RouteReadyTasksInput {
	scheduler: Scheduler;
	readyTasks: readonly Task[];
	allTasks: readonly TaskSnapshot[];
	agents: readonly Agent[];
	options: RunTeamOptions;
}

export function routeReadyTasks(input: RouteReadyTasksInput): readonly RoutedTask[] {
	const schedulingStrategy = input.scheduler.resolveStrategy(input.options);
	return input.scheduler
		.assignReadyTasks([...input.readyTasks], input.allTasks, input.agents, input.options)
		.map((task) => ({
			task,
			decision: createRoutingDecision(task.snapshot(), schedulingStrategy),
		}));
}
