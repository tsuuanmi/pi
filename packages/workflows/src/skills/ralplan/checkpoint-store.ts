import { readFile } from "node:fs/promises";
import type { OrchestratorCheckpoint, OrchestratorCheckpointStore } from "@tsuuanmi/pi-orchestrator";
import type { RalplanStage } from "#workflows/session/paths";
import { ralplanCheckpointPath } from "#workflows/session/session-layout";
import { writeJsonAtomic } from "#workflows/state/state-writer";

export function createRalplanCheckpointStore(
	cwd: string,
	runId: string,
	stageN: number,
	stage: RalplanStage,
	sessionId: string,
): OrchestratorCheckpointStore {
	const path = ralplanCheckpointPath(cwd, runId, stageN, stage, sessionId);
	return {
		async load() {
			try {
				const value = await readFile(path, "utf8");
				if (value.trim().length === 0) throw new Error("ralplan orchestrator checkpoint is empty");
				return JSON.parse(value) as OrchestratorCheckpoint;
			} catch (error) {
				if (isMissingFile(error)) return undefined;
				if (error instanceof SyntaxError) {
					throw new Error(`ralplan orchestrator checkpoint JSON is invalid: ${error.message}`);
				}
				throw error;
			}
		},
		async save(checkpoint) {
			await writeJsonAtomic(path, { ...checkpoint }, { cwd });
		},
	};
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
