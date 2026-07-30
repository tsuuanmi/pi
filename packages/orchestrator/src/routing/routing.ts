import type { Agent } from "@tsuuanmi/pi-agent";
import { createRoutingDecision } from "#orchestrator/routing/execution-router";
import type { Scheduler } from "#orchestrator/routing/scheduler";
import type { Task } from "#orchestrator/task/task";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { RunTeamOptions, SchedulingStrategy } from "#orchestrator/types";

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
