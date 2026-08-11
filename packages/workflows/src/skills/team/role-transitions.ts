import { transitionTeamTask } from "#workflows/skills/team/tasks";
import type { TeamTask } from "#workflows/skills/team/types";

export function markWorkerInProgress(
	cwd: string,
	sessionId: string,
	teamId: string,
	taskId: string,
): Promise<TeamTask> {
	return transitionTeamTask(cwd, { teamId, taskId, status: "in_progress" }, sessionId);
}
