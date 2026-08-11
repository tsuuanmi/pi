import { teamTaskPath } from "#workflows/session/session-layout";
import { assertTeamDependencies } from "#workflows/skills/team/dependencies";
import { passingReviewGate, writeReviewGateBlock } from "#workflows/skills/team/gates";
import { assertSafeId } from "#workflows/skills/team/ids";
import { createTeamCompletionEvidence, createTeamTaskRecord } from "#workflows/skills/team/records";
import { readTeamSnapshot, syncTeamState } from "#workflows/skills/team/state";
import { appendTeamEvent, listTasks, readJsonObject, resolveTeamId } from "#workflows/skills/team/store";
import type { TeamCompletionEvidence, TeamTask } from "#workflows/skills/team/types";
import { parseTeamTask, parseTeamTaskStatus } from "#workflows/skills/team/validation";
import { nowIso, sha256, writeJsonAtomic } from "#workflows/state/state-writer";

export async function createTeamTask(
	cwd: string,
	input: { teamId?: string; id?: string; title: string; description: string; owner?: string; dependsOn?: string[] },
	sessionId: string,
): Promise<TeamTask> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const id =
		input.id === undefined ? `task-${sha256(`${input.title}\n${input.description}`).slice(0, 12)}` : input.id.trim();
	assertSafeId("task_id", id);
	const existing = await readJsonObject(teamTaskPath(cwd, teamId, id, sessionId));
	if (existing) throw new Error(`team task already exists: ${id}`);
	const now = nowIso();
	const task = createTeamTaskRecord({
		id,
		title: input.title,
		description: input.description,
		owner: input.owner,
		depends_on: input.dependsOn,
		created_at: now,
		updated_at: now,
	});
	assertTeamDependencies([...(await listTasks(cwd, teamId, sessionId)), task]);
	await writeJsonAtomic(teamTaskPath(cwd, teamId, id, sessionId), { ...task }, { cwd });
	await appendTeamEvent(cwd, teamId, { type: "task_created", task_id: id, message: task.title }, sessionId);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return task;
}

export async function transitionTeamTask(
	cwd: string,
	input: {
		teamId?: string;
		taskId: string;
		status: string;
		workerId?: string;
		evidence?: Omit<TeamCompletionEvidence, "recorded_at">;
	},
	sessionId: string,
): Promise<TeamTask> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("task_id", input.taskId);
	const raw = await readJsonObject(teamTaskPath(cwd, teamId, input.taskId, sessionId));
	if (!raw) throw new Error(`unknown team task: ${input.taskId}`);
	const current = parseTeamTask(raw, input.taskId);
	const status = parseTeamTaskStatus(input.status);
	const now = nowIso();
	if (status === "completed" && !input.evidence)
		throw new Error("completion evidence is required for completed team tasks");
	if (status === "completed" && !passingReviewGate(current)) {
		const reason = "completed team tasks require a passing reviewer review_report";
		const blocked = await writeReviewGateBlock(cwd, teamId, current, sessionId, reason);
		await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
		throw new Error(`${reason}; review gate ${blocked.review_gate?.status}`);
	}
	const next: TeamTask = {
		...current,
		status,
		assignee: input.workerId ?? current.assignee,
		completion_evidence: input.evidence
			? createTeamCompletionEvidence(current.id, input.evidence, now)
			: current.completion_evidence,
		version: current.version + 1,
		updated_at: now,
		completed_at: status === "completed" ? now : current.completed_at,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "task_transitioned",
			task_id: next.id,
			worker: input.workerId,
			message: status,
			data: { status },
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return next;
}
