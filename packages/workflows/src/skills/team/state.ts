import { teamConfigPath, teamDir, workflowStatePath } from "#workflows/session/session-layout";
import { buildTeamHud } from "#workflows/skills/team/hud";
import { activeTeamId, appendTeamEvent, listTasks, readTeamConfig } from "#workflows/skills/team/store";
import type { TeamConfig, TeamSnapshot, TeamWorker } from "#workflows/skills/team/types";
import { assertSafeId, countTeamTasks, emptyTaskCounts, slugifyTeamId } from "#workflows/skills/team/validation";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { nowIso, readFileOrLiteral, sha256, writeJsonAtomic } from "#workflows/state/state-writer";
import { writeWorkflowState } from "#workflows/state/workflow-state";

export async function syncTeamState(cwd: string, snapshot: TeamSnapshot, sessionId: string): Promise<void> {
	const active = snapshot.phase !== "missing" && snapshot.phase !== "complete" && snapshot.phase !== "cancelled";
	const state = await writeWorkflowState(
		cwd,
		"team",
		{
			active,
			current_phase: snapshot.phase,
			team_id: snapshot.team_id,
			task_counts: snapshot.task_counts,
		},
		"pi workflow state write",
		{ operation: "runtime-sync", sessionId },
	);
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "team",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "team", sessionId),
			hud: buildTeamHud(snapshot),
		},
		{ sessionId },
	);
}

export async function startTeam(
	cwd: string,
	input: { task: string; teamId?: string; workers?: Array<{ id?: string; name?: string; role?: string }> },
	sessionId: string,
): Promise<TeamSnapshot> {
	const task = (await readFileOrLiteral(input.task, cwd)).trim();
	if (!task) throw new Error("team task is required");
	const teamId =
		input.teamId === undefined ? `${slugifyTeamId(task)}-${sha256(task).slice(0, 8)}` : input.teamId.trim();
	assertSafeId("team_id", teamId);
	const now = nowIso();
	const workers: TeamWorker[] = (
		input.workers && input.workers.length > 0 ? input.workers : [{ role: "implementation" }, { role: "verification" }]
	).map((worker, index) => ({
		id: worker.id ?? `worker-${index + 1}`,
		name: worker.name ?? `Worker ${index + 1}`,
		role: worker.role ?? "implementation",
		status: "idle",
		assigned_tasks: [],
		updated_at: now,
	}));
	for (const worker of workers) assertSafeId("worker_id", worker.id);
	const config: TeamConfig = {
		team_id: teamId,
		display_name: teamId,
		task,
		phase: "running",
		workers,
		created_at: now,
		updated_at: now,
	};
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...config }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_started", message: task, data: { worker_count: workers.length } },
		sessionId,
	);
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	await syncTeamState(cwd, snapshot, sessionId);
	return snapshot;
}

export async function readTeamSnapshot(cwd: string, sessionId: string, teamId?: string): Promise<TeamSnapshot> {
	const teamIdResolved = teamId === undefined ? await activeTeamId(cwd, sessionId) : teamId.trim();
	if (!teamIdResolved)
		return {
			phase: "missing",
			task_total: 0,
			task_counts: emptyTaskCounts(),
			workers: [],
			tasks: [],
			updated_at: nowIso(),
		};
	assertSafeId("team_id", teamIdResolved);
	const config = await readTeamConfig(cwd, teamIdResolved, sessionId);
	if (!config)
		return {
			team_id: teamIdResolved,
			phase: "missing",
			task_total: 0,
			task_counts: emptyTaskCounts(),
			workers: [],
			tasks: [],
			updated_at: nowIso(),
		};
	const tasks = await listTasks(cwd, teamIdResolved, sessionId);
	const counts = countTeamTasks(tasks);
	const phase =
		config.phase === "running" && tasks.length > 0 && tasks.every((task) => task.status === "completed")
			? "awaiting_integration"
			: config.phase;
	return {
		team_id: teamIdResolved,
		phase,
		state_dir: teamDir(cwd, sessionId),
		task_total: tasks.length,
		task_counts: counts,
		workers: config.workers,
		tasks,
		completion_gate: config.completion_gate,
		updated_at: config.updated_at,
	};
}
