/**
 * Session-scoped artifact path layout for Pi workflow state.
 *
 * Pure, acyclic path module. Two root functions:
 *   - `piGlobalRoot(cwd)` → `.pi/` (legacy/global state + state-integrity logs)
 *   - `piSessionRoot(cwd, sessionId)` → `.pi/{encoded}/`
 *
 * Runtime workflow artifacts require an explicit session id. The global `.pi/`
 * root is reserved for shared project config and explicitly global state only.
 */

import { join } from "node:path";
import type { RalplanStage, WorkflowSkill } from "./paths.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File name for the session activity marker within a session directory. */
export const PI_SESSION_ACTIVITY_FILE = ".session-activity.json";

// ---------------------------------------------------------------------------
// Encoding / Decoding
// ---------------------------------------------------------------------------

/**
 * Encode a session id for use as a filesystem path segment.
 *
 * Uses `encodeURIComponent` with dots additionally escaped to `%2E` so that
 * the encoded form never contains `..` (path traversal) or `/` (separator).
 */
export function encodeSessionSegment(id: string): string {
	return encodeURIComponent(id).replaceAll(".", "%2E");
}

/**
 * Decode a session path segment back to the original session id.
 *
 * Inverse of {@link encodeSessionSegment}.
 */
export function decodeSessionSegment(segment: string): string {
	return decodeURIComponent(segment);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Re-export the canonical assertSafePathComponent from state-schema.ts. */
export { assertSafePathComponent } from "./state-schema.ts";

/**
 * Assert that a session id is non-empty and usable.
 * Throws with a descriptive message (including the source label) on failure.
 */
export function assertNonEmptySessionId(value: unknown, source: string): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`No session ID provided. Set PI_SESSION_ID env var or pass --session. (source: ${source})`);
	}
}

// ---------------------------------------------------------------------------
// Session directory helpers
// ---------------------------------------------------------------------------

/** Return the directory name (not full path) for a session id, e.g. `20260627-143522`. */
export function sessionDirName(id: string): string {
	return encodeSessionSegment(id);
}

/** Extract the session id from a session directory name like `20260627-143522`. */
export function sessionIdFromDirName(name: string): string | undefined {
	try {
		return decodeSessionSegment(name);
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Path builders — global root (audit + transaction journal only)
// ---------------------------------------------------------------------------

/**
 * Global `.pi/` root. Reserved for shared project config and explicitly global
 * state that is not owned by a workflow session.
 */
export function piGlobalRoot(cwd: string): string {
	return join(cwd, ".pi");
}

// Explicit global state directory for non-session-owned state.
export function piStateDir(cwd: string): string {
	return join(piGlobalRoot(cwd), "state");
}

export function auditLogPath(cwd: string, sessionId: string): string {
	return join(sessionStateDir(cwd, sessionId), "audit.jsonl");
}

export function transactionJournalPath(cwd: string, sessionId: string, mutationId: string): string {
	const encoded = encodeURIComponent(mutationId).replaceAll(".", "%2E");
	return join(sessionStateDir(cwd, sessionId), "transactions", `${encoded}.json`);
}

// ---------------------------------------------------------------------------
// Path builders — session-scoped root (all workflow state)
// ---------------------------------------------------------------------------

/**
 * Full path to the workflow state root: `cwd/.pi/{encoded}/`.
 */
export function piSessionRoot(cwd: string, sessionId: string): string {
	assertNonEmptySessionId(sessionId, "piSessionRoot");
	return join(cwd, ".pi", sessionDirName(sessionId.trim()));
}

/**
 * Path to the session activity marker file for a given session.
 * `.pi/{encoded}/.session-activity.json`
 */
export function sessionActivityPath(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), PI_SESSION_ACTIVITY_FILE);
}

// ---------------------------------------------------------------------------
// Session-aware path builders (sessionId required)
// ---------------------------------------------------------------------------

export function sessionStateDir(cwd: string, sessionId: string): string {
	return join(piSessionRoot(cwd, sessionId), "state");
}

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

export function teamMailboxPath(cwd: string, teamId: string, recipient: string, sessionId: string): string {
	return join(teamRunDir(cwd, teamId, sessionId), "mailbox", `${recipient}.jsonl`);
}
