import { readFile } from "node:fs/promises";
import { teamCheckpointPath } from "#workflows/session/session-layout";
import { createTeamCheckpointStore, type TeamCheckpointStore } from "#workflows/skills/team/orchestrator-checkpoint";
import { writeJsonAtomic } from "#workflows/state/state-writer";

export function createSessionCheckpointStore(
	cwd: string,
	teamId: string,
	sessionId: string,
	runId: string,
): TeamCheckpointStore {
	const path = teamCheckpointPath(cwd, teamId, sessionId, runId);
	return createTeamCheckpointStore({
		read: async () => {
			try {
				return await readFile(path, "utf8");
			} catch (error) {
				if (isMissingFile(error)) return undefined;
				throw error;
			}
		},
		write: async (value) => {
			const parsed: unknown = JSON.parse(value);
			if (!isRecord(parsed)) throw new Error("team checkpoint must be a JSON object");
			await writeJsonAtomic(path, parsed, { cwd });
		},
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
