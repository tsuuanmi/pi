import type { Agent } from "@tsuuanmi/pi-agent";
import type { TaskSnapshot } from "#orchestrator/task/types";

export function resolveAssignedAgent(task: TaskSnapshot, agents: readonly Agent[]): Agent | undefined {
	if (!task.assignee) return undefined;
	const assigned = agents.find((agent) => agent.name === task.assignee);
	if (!assigned) throw new Error(`Unknown assignee: ${task.assignee}`);
	return assigned;
}
