/**
 * Session-scoped artifact path layout for Pi workflow state.
 *
 * Pure, acyclic path module. Workflow paths compose the shared roots:
 *   - `piGlobalRoot(cwd)` → `.pi/`
 *   - `piSessionRoot(cwd, sessionId)` → `.pi/{encoded}/`
 *
 * Runtime workflow artifacts require an explicit session id. The global `.pi/`
 * root is reserved for shared project config and explicitly global state only.
 */

import { join } from "node:path";
import type { RalplanStage, WorkflowSkill } from "#workflows/session/paths";
import { encodePathSegment, piGlobalRoot, piSessionRoot, sessionStateDir } from "#workflows/session/root";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Re-export the canonical assertSafePathComponent from state-schema.ts. */
export { assertSafePathComponent } from "#workflows/state/state-schema";

// ---------------------------------------------------------------------------
// Path builders — global root (audit + transaction journal only)
// ---------------------------------------------------------------------------

// Explicit global state directory for non-session-owned state.
export function piStateDir(cwd: string): string {
	return join(piGlobalRoot(cwd), "state");
}

export function auditLogPath(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "audit.jsonl");
}

export function transactionJournalPath(cwd: string, sessionId: string, mutationId: string): string {
	const encoded = encodePathSegment(mutationId);
	return join(sessionStateDir(cwd, sessionId), "transactions", `${encoded}.json`);
}

// ---------------------------------------------------------------------------
// Session-aware path builders (sessionId required)
// ---------------------------------------------------------------------------

export function piWorkflowRoot(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "workflows");
}

export function workflowStatePath(cwd: string, skill: WorkflowSkill, sessionId: string): string {
	return join(piWorkflowRoot(cwd, sessionId), skill, "state.json");
}

export function workflowActiveStatePath(cwd: string, sessionId: string): string {
	return join(piWorkflowRoot(cwd, sessionId), "active-state.json");
}

export function piSpecsDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "specs");
}

export function deepInterviewSpecPath(cwd: string, slug: string, sessionId: string): string {
	return join(piSpecsDir(cwd, sessionId), `deep-interview-${slug}.md`);
}

export function deepInterviewIndexPath(cwd: string, sessionId: string): string {
	return join(piSpecsDir(cwd, sessionId), "deep-interview-index.jsonl");
}

export function piPlansDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "plans");
}

function ralplanRootDir(cwd: string, sessionId: string): string {
	return join(piPlansDir(cwd, sessionId), "ralplan");
}

function ralplanRunDir(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRootDir(cwd, sessionId), runId);
}

export function ralplanIndexPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "index.jsonl");
}

export function ralplanCheckpointPath(
	cwd: string,
	runId: string,
	stageN: number,
	stage: RalplanStage,
	sessionId: string,
): string {
	return join(
		ralplanRunDir(cwd, runId, sessionId),
		"checkpoints",
		`${stageN.toString().padStart(2, "0")}-${stage}.json`,
	);
}

export function ralplanStageArtifactPath(
	cwd: string,
	runId: string,
	stageN: number,
	stage: RalplanStage,
	sessionId: string,
): string {
	return join(ralplanRunDir(cwd, runId, sessionId), `stage-${stageN.toString().padStart(2, "0")}-${stage}.md`);
}

export function ralplanPendingApprovalPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "pending-approval.md");
}

export function ralplanCompletionLockPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), ".completion.lock");
}

/** Per-run ralplan obstacle ledger (Phase R-1). Run-scoped: each run's critic/architect obstacles live beside its index. */
export function ralplanObstacleLedgerPath(cwd: string, runId: string, sessionId: string): string {
	return join(ralplanRunDir(cwd, runId, sessionId), "obstacles.json");
}

export function ralplanGateArtifactPath(
	cwd: string,
	runId: string,
	gate: "explorer",
	attempt: number,
	sessionId: string,
): string {
	return join(
		ralplanRunDir(cwd, runId, sessionId),
		"gates",
		gate,
		`attempt-${attempt.toString().padStart(2, "0")}.json`,
	);
}

export function ultragoalDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "ultragoal");
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

export function ultragoalCheckpointsDir(cwd: string, sessionId: string): string {
	return join(ultragoalDir(cwd, sessionId), "checkpoints");
}

export function ultragoalCheckpointPath(cwd: string, sessionId: string, checkpointId: string): string {
	return join(ultragoalCheckpointsDir(cwd, sessionId), `${checkpointId}.json`);
}

export function teamDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "team");
}

function teamRunDir(cwd: string, teamId: string, sessionId: string): string {
	return join(teamDir(cwd, sessionId), teamId);
}

export function teamConfigPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "config.json");
}

function teamTasksDir(cwd: string, teamId: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "tasks");
}

export function teamTaskPath(cwd: string, teamId: string, taskId: string, sessionId: string): string {
	return join(teamTasksDir(cwd, teamId, sessionId), `${taskId}.json`);
}

export function teamEventsPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "events.jsonl");
}

export function teamReceiptsPath(cwd: string, teamId: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "receipts.jsonl");
}

export function teamCheckpointPath(cwd: string, teamId: string, sessionId: string, runId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "checkpoints", `${runId}.json`);
}

export function teamRoleRunPath(cwd: string, teamId: string, sessionId: string, runId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "runs", `${runId}.json`);
}

export function teamGateArtifactPath(
	cwd: string,
	teamId: string,
	gate: "completion",
	attempt: number,
	sessionId: string,
): string {
	return join(
		teamRunDir(cwd, teamId, sessionId),
		"gates",
		gate,
		`attempt-${attempt.toString().padStart(2, "0")}.json`,
	);
}

export function teamTaskGateArtifactPath(
	cwd: string,
	teamId: string,
	taskId: string,
	gate: "review",
	attempt: number,
	sessionId: string,
): string {
	return join(
		teamRunDir(cwd, teamId, sessionId),
		"tasks",
		taskId,
		"gates",
		gate,
		`attempt-${attempt.toString().padStart(2, "0")}.json`,
	);
}

export function teamMailboxPath(cwd: string, teamId: string, recipient: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "mailbox", `${recipient}.jsonl`);
}
