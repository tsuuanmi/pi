export type WorkflowSkill = "deep-interview" | "ralplan" | "team" | "ultragoal";
export type RalplanStage = "planner" | "architect" | "critic" | "revision" | "adr" | "final";

// ---------------------------------------------------------------------------
// Re-exports from session-layout.ts (mandatory session-scoped isolation)
//
// All session-aware path builders live in session-layout.ts and require a
// sessionId — there is no global fallback. This module re-exports them for
// convenient imports. Callers that need the global `.pi/` root (audit, journal,
// adopt) must use `piGlobalRoot` explicitly.
// ---------------------------------------------------------------------------

export {
	assertNonEmptySessionId,
	auditLogPath,
	decodeSessionSegment,
	deepInterviewIndexPath,
	deepInterviewSpecPath,
	encodeSessionSegment,
	PI_SESSION_ACTIVITY_FILE,
	piGlobalRoot,
	piSessionRoot,
	piSpecsDir,
	piStateDir,
	piWorkflowRoot,
	ralplanIndexPath,
	ralplanPendingApprovalPath,
	ralplanStageArtifactPath,
	sessionActivityPath,
	sessionDirName,
	sessionIdFromDirName,
	teamConfigPath,
	teamDir,
	teamEventsPath,
	teamMailboxPath,
	teamTaskPath,
	transactionJournalPath,
	ultragoalBriefPath,
	ultragoalGoalsPath,
	ultragoalLedgerPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "./session-layout.ts";

// Re-export canonical assertion functions from state-schema.ts.
export { assertRalplanStage, assertSafePathComponent, assertWorkflowSkill } from "./state-schema.ts";
