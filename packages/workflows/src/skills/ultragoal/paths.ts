import { join } from "node:path";
import { skillDir } from "@tsuuanmi/pi/session/layout";
import { assertSafePathComponent } from "#workflows/state/state-schema";

export function ultragoalDir(cwd: string, sessionId: string): string {
	return skillDir(cwd, "ultragoal", sessionId);
}

export function ultragoalBriefPath(cwd: string, sessionId: string): string {
	return join(ultragoalDir(cwd, sessionId), "brief.md");
}

export function ultragoalGoalsPath(cwd: string, sessionId: string): string {
	return join(ultragoalDir(cwd, sessionId), "goals.json");
}

export function ultragoalLedgerPath(cwd: string, sessionId: string): string {
	return join(ultragoalDir(cwd, sessionId), "ledger.jsonl");
}

export function ultragoalCheckpointPath(cwd: string, sessionId: string, checkpointId: string): string {
	assertSafePathComponent(checkpointId, "checkpointId");
	return join(ultragoalDir(cwd, sessionId), "checkpoints", `${checkpointId}.json`);
}
