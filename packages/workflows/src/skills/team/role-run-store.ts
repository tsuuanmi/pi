import { teamRoleRunPath } from "#workflows/skills/team/paths";
import { nowIso, writeJsonAtomic } from "#workflows/state/state-writer";

export async function saveRoleFailure(
	cwd: string,
	teamId: string,
	sessionId: string,
	runId: string,
	role: string,
	error: string,
): Promise<void> {
	assertId(runId, "run id");
	assertId(role, "role");
	if (error.trim().length === 0) throw new Error("team role failure requires an error");
	await writeJsonAtomic(
		teamRoleRunPath(cwd, teamId, sessionId, runId),
		{
			version: 1,
			team_id: teamId,
			run_id: runId,
			role,
			status: "failed",
			error,
			updated_at: nowIso(),
		},
		{ cwd },
	);
}

function assertId(value: string, label: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`invalid team ${label}: ${value}`);
}
