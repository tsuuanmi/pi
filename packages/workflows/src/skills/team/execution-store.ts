import { teamTaskPath } from "#workflows/session/session-layout";
import { syncTeamState, type TeamSnapshot, type TeamTaskExecution } from "#workflows/skills/team/team-runtime";
import { canonicalizeJson, readExistingStateForMutation, writeJsonAtomic } from "#workflows/state/state-writer";

export async function saveTeamExecution(cwd: string, sessionId: string, snapshot: TeamSnapshot): Promise<void> {
	if (!snapshot.team_id) throw new Error("cannot save execution for a missing team");
	for (const task of snapshot.tasks) {
		if (!task.execution) continue;
		const path = teamTaskPath(cwd, snapshot.team_id, task.id, sessionId);
		const current = await readExistingStateForMutation(path);
		if (current.kind === "absent") throw new Error(`team task state is missing: ${task.id}`);
		if (current.kind === "corrupt") throw new Error(`team task state is corrupt: ${task.id}: ${current.error}`);
		assertFresh(task.id, current.value, task.execution);
		await writeJsonAtomic(path, { ...current.value, execution: task.execution }, { cwd });
	}
	await syncTeamState(cwd, snapshot, sessionId);
}

function assertFresh(taskId: string, current: Record<string, unknown>, incoming: TeamTaskExecution): void {
	const existing = current.execution;
	if (existing === undefined) return;
	if (!isExecution(existing)) throw new Error(`team task execution is corrupt: ${taskId}`);
	const currentTime = Date.parse(existing.updated_at);
	const incomingTime = Date.parse(incoming.updated_at);
	if (!Number.isFinite(currentTime) || !Number.isFinite(incomingTime)) {
		throw new Error(`team task execution has an invalid timestamp: ${taskId}`);
	}
	if (incomingTime < currentTime) throw new Error(`team task execution is stale: ${taskId}`);
	if (
		incomingTime === currentTime &&
		JSON.stringify(canonicalizeJson(existing)) !== JSON.stringify(canonicalizeJson(incoming))
	) {
		throw new Error(`team task execution conflicts at its timestamp: ${taskId}`);
	}
}

function isExecution(value: unknown): value is TeamTaskExecution {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { updated_at?: unknown }).updated_at === "string"
	);
}
