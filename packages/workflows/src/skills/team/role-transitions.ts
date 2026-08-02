import { type TeamTask, transitionTeamTask } from "#workflows/skills/team/team-runtime";

export function markWorkerInProgress(
	cwd: string,
	sessionId: string,
	teamId: string,
	taskId: string,
): Promise<TeamTask> {
	return transitionTeamTask(cwd, { teamId, taskId, status: "in_progress" }, sessionId);
}
