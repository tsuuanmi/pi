import type { TaskRoutingDecision } from "#orchestrator/routing/routing";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { SchedulingStrategy } from "#orchestrator/types";

export function resolveSchedulingStrategy(
	defaultStrategy: SchedulingStrategy,
	requestedStrategy: SchedulingStrategy | undefined,
): SchedulingStrategy {
	return requestedStrategy ?? defaultStrategy;
}

export function createRoutingDecision(task: TaskSnapshot, schedulingStrategy: SchedulingStrategy): TaskRoutingDecision {
	if (!task.assignee) throw new Error(`Routing decision missing assignee for task: ${task.id}`);
	return Object.freeze({
		taskId: task.id,
		taskTitle: task.title,
		agent: task.assignee,
		schedulingStrategy,
	});
}
