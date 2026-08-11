import type { TeamTask, TeamTaskStatus } from "#workflows/skills/team/types";

export function emptyTaskCounts(): Record<TeamTaskStatus, number> {
	return { pending: 0, blocked: 0, in_progress: 0, completed: 0, failed: 0 };
}

export function countTeamTasks(tasks: readonly TeamTask[]): Record<TeamTaskStatus, number> {
	const counts = emptyTaskCounts();
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}
