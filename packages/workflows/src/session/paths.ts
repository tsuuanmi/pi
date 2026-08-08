export type WorkflowSkill = "deep-interview" | "ralplan" | "team" | "ultragoal";
export type RalplanStage =
	| "pre-planner"
	| "planner"
	| "architect"
	| "critic"
	| "revision"
	| "adr"
	| "final"
	| "expert-stage";

// Workflow path API. Shared roots and path-segment helpers live in root.ts.
export {
	auditLogPath,
	deepInterviewIndexPath,
	deepInterviewSpecPath,
	piSpecsDir,
	piStateDir,
	piWorkflowRoot,
	ralplanCompletionLockPath,
	ralplanGateArtifactPath,
	ralplanIndexPath,
	ralplanPendingApprovalPath,
	ralplanStageArtifactPath,
	teamConfigPath,
	teamDir,
	teamEventsPath,
	teamGateArtifactPath,
	teamMailboxPath,
	teamTaskGateArtifactPath,
	teamTaskPath,
	transactionJournalPath,
	ultragoalBriefPath,
	ultragoalGoalsPath,
	ultragoalLedgerPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "#workflows/session/session-layout";
// Re-export canonical assertion functions from state-schema.ts.
export {
	assertRalplanStage,
	assertSafePathComponent,
	assertWorkflowSkill,
} from "#workflows/state/state-schema";
