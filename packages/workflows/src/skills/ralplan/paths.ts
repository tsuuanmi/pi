import { join } from "node:path";
import { sessionPlansDir } from "@tsuuanmi/pi/session/layout";
import type { RalplanStage } from "#workflows/skills/ralplan/types";
import { assertRalplanStage, assertSafePathComponent } from "#workflows/state/state-schema";

export function ralplanRunDir(cwd: string, runId: string, sessionId: string): string {
	assertSafePathComponent(runId, "runId");
	return join(sessionPlansDir(cwd, sessionId), "ralplan", runId);
}

export function ralplanStageArtifactPath(
	cwd: string,
	runId: string,
	stageN: number,
	stage: RalplanStage,
	sessionId: string,
): string {
	assertRalplanStage(stage);
	if (!Number.isInteger(stageN) || stageN < 1 || stageN > 999) throw new Error(`invalid stageN: ${stageN}`);
	return join(ralplanRunDir(cwd, runId, sessionId), `stage-${String(stageN).padStart(2, "0")}-${stage}.md`);
}

export function ralplanIndexPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "index.jsonl");
}

export function ralplanPendingApprovalPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "pending-approval.md");
}

export function ralplanCompletionLockPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), ".completion.lock");
}

export function ralplanGateArtifactPath(
	cwd: string,
	runId: string,
	gate: "explorer",
	attempt: number,
	sessionId: string,
): string {
	if (!Number.isInteger(attempt) || attempt < 1 || attempt > 999) throw new Error(`invalid attempt: ${attempt}`);
	return join(
		ralplanRunDir(cwd, runId, sessionId),
		"gates",
		gate,
		`attempt-${attempt.toString().padStart(2, "0")}.json`,
	);
}

export function ralplanObstacleLedgerPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "obstacles.json");
}
