import { join } from "node:path";
import { skillDir } from "@tsuuanmi/pi/session/layout";
import { assertSafePathComponent } from "#workflows/state/state-schema";

export function teamsDir(cwd: string, sessionId: string): string {
	return skillDir(cwd, "team", sessionId);
}

export function teamDir(cwd: string, teamId: string, sessionId: string): string {
	assertSafePathComponent(teamId, "teamId");
	return join(teamsDir(cwd, sessionId), teamId);
}

export function teamConfigPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamDir(cwd, teamId, sessionId), "config.json");
}

export function teamEventsPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamDir(cwd, teamId, sessionId), "events.jsonl");
}

export function teamTaskPath(cwd: string, teamId: string, taskId: string, sessionId: string): string {
	assertSafePathComponent(taskId, "taskId");
	return join(teamDir(cwd, teamId, sessionId), "tasks", `${taskId}.json`);
}

export function teamMailboxPath(cwd: string, teamId: string, workerId: string, sessionId: string): string {
	assertSafePathComponent(workerId, "workerId");
	return join(teamDir(cwd, teamId, sessionId), "mailbox", `${workerId}.jsonl`);
}

export function teamGateArtifactPath(
	cwd: string,
	teamId: string,
	gate: "completion",
	attempt: number,
	sessionId: string,
): string {
	return join(teamDir(cwd, teamId, sessionId), "gates", gate, `attempt-${attempt.toString().padStart(2, "0")}.json`);
}

export function teamTaskGateArtifactPath(
	cwd: string,
	teamId: string,
	taskId: string,
	gate: "review",
	attempt: number,
	sessionId: string,
): string {
	assertSafePathComponent(taskId, "taskId");
	return join(
		teamDir(cwd, teamId, sessionId),
		"tasks",
		taskId,
		"gates",
		gate,
		`attempt-${attempt.toString().padStart(2, "0")}.json`,
	);
}

export function teamCheckpointPath(cwd: string, teamId: string, sessionId: string, checkpointId: string): string {
	assertSafePathComponent(checkpointId, "checkpointId");
	return join(teamDir(cwd, teamId, sessionId), "checkpoints", `${checkpointId}.json`);
}

export function teamReceiptsPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamDir(cwd, teamId, sessionId), "receipts.jsonl");
}

export function teamRoleRunPath(cwd: string, teamId: string, sessionId: string, roleRunId: string): string {
	assertSafePathComponent(roleRunId, "roleRunId");
	return join(teamDir(cwd, teamId, sessionId), "runs", `${roleRunId}.json`);
}
