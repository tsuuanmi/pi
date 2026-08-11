import { readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { teamConfigPath, teamEventsPath, teamTaskPath } from "#workflows/session/session-layout";
import type { TeamConfig, TeamTask } from "#workflows/skills/team/types";
import { assertSafeId, parseTeamConfig, parseTeamTask } from "#workflows/skills/team/validation";
import { appendJsonl, nowIso, readExistingStateForMutation } from "#workflows/state/state-writer";
import { defaultWorkflowId, readWorkflowState } from "#workflows/state/workflow-state";

export async function appendTeamEvent(
	cwd: string,
	teamId: string,
	event: Record<string, unknown>,
	sessionId: string,
): Promise<void> {
	await appendJsonl(
		teamEventsPath(cwd, teamId, sessionId),
		{ event_id: defaultWorkflowId("evt"), ts: nowIso(), ...event },
		{ cwd },
	);
}

export async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
	const read = await readExistingStateForMutation(path);
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`JSON state is corrupt: ${read.error}`);
	return read.value;
}

export async function readTeamConfig(cwd: string, teamId: string, sessionId: string): Promise<TeamConfig | undefined> {
	const raw = await readJsonObject(teamConfigPath(cwd, teamId, sessionId));
	if (!raw) return undefined;
	return parseTeamConfig(raw, teamId);
}

export async function activeTeamId(cwd: string, sessionId: string): Promise<string | undefined> {
	const state = await readWorkflowState(cwd, "team", { sessionId });
	return typeof state?.team_id === "string" ? state.team_id : undefined;
}

export async function resolveTeamId(cwd: string, sessionId: string, teamId?: string): Promise<string> {
	const resolved = teamId === undefined ? await activeTeamId(cwd, sessionId) : teamId.trim();
	if (!resolved) throw new Error("missing team_id");
	assertSafeId("team_id", resolved);
	return resolved;
}

export async function listTasks(cwd: string, teamId: string, sessionId: string): Promise<TeamTask[]> {
	let entries: string[];
	try {
		entries = await readdir(dirname(teamTaskPath(cwd, teamId, "placeholder", sessionId)));
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return [];
		throw error;
	}
	const tasks: TeamTask[] = [];
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		const taskId = entry.slice(0, -5);
		const raw = await readJsonObject(teamTaskPath(cwd, teamId, taskId, sessionId));
		if (raw) tasks.push(parseTeamTask(raw, taskId));
	}
	return tasks.sort((a, b) => a.id.localeCompare(b.id));
}
