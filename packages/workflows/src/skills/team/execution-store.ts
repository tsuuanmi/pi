import { teamTaskPath } from "#workflows/session/session-layout";
import { syncTeamState, type TeamSnapshot } from "#workflows/skills/team/team-runtime";
import { readExistingStateForMutation, writeJsonAtomic } from "#workflows/state/state-writer";

export async function saveTeamExecution(cwd: string, sessionId: string, snapshot: TeamSnapshot): Promise<void> {
	if (!snapshot.team_id) throw new Error("cannot save execution for a missing team");
	for (const task of snapshot.tasks) {
		if (!task.execution) continue;
		const path = teamTaskPath(cwd, snapshot.team_id, task.id, sessionId);
		const current = await readExistingStateForMutation(path);
		if (current.kind === "absent") throw new Error(`team task state is missing: ${task.id}`);
		if (current.kind === "corrupt") throw new Error(`team task state is corrupt: ${task.id}: ${current.error}`);
		await writeJsonAtomic(path, { ...current.value, execution: task.execution }, { cwd });
	}
	await syncTeamState(cwd, snapshot, sessionId);
}
