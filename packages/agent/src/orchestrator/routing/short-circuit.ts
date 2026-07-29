import type { Agent } from "#agent/agent/agent";
import type { TaskSnapshot } from "#agent/task/types";

export function resolveAssignedAgent(task: TaskSnapshot, agents: readonly Agent[]): Agent | undefined {
	if (!task.assignee) return undefined;
	const assigned = agents.find((agent) => agent.name === task.assignee);
	if (!assigned) throw new Error(`Unknown assignee: ${task.assignee}`);
	return assigned;
}
