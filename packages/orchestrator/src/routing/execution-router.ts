import type { AgentSelection } from "#orchestrator/routing/agent-selector";
import type { TaskRoutingDecision } from "#orchestrator/routing/routing";
import type { TaskSnapshot } from "#orchestrator/task/types";
import type { SchedulingStrategy } from "#orchestrator/types";

export function resolveSchedulingStrategy(
	defaultStrategy: SchedulingStrategy,
	requestedStrategy: SchedulingStrategy | undefined,
): SchedulingStrategy {
	return requestedStrategy ?? defaultStrategy;
}

export function createRoutingDecision(
	task: TaskSnapshot,
	schedulingStrategy: SchedulingStrategy,
	selection: AgentSelection,
): TaskRoutingDecision {
	if (!task.assignee) throw new Error(`Routing decision missing assignee for task: ${task.id}`);
	return Object.freeze({
		taskId: task.id,
		taskTitle: task.title,
		agent: task.assignee,
		schedulingStrategy,
		score: selection.score,
		reasons: selection.reasons,
		candidates: selection.candidates,
		rejected: selection.rejected,
	});
}
