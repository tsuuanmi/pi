/**
 * Public API for @tsuuanmi/pi-workflows.
 *
 * This barrel export exposes the symbols that external packages
 * (including @tsuuanmi/pi-coding-agent) and test suites import.
 */

// Register built-in skill transition tables for selector/gate helpers exported below.
import "./harness/deep-interview/deep-interview-transitions.ts";
import "./harness/ralplan/ralplan-transitions.ts";
import "./harness/team/team-transitions.ts";
import "./harness/ultragoal/ultragoal-transitions.ts";

// Workflow commands
export { runStateCommand } from "./commands/state-command.ts";
export { handleWorkflowCommand, runWorkflowCommand } from "./commands/workflow.ts";
// Extension entry point
export { default } from "./extensions/workflows.ts";
export * from "./harness/deep-interview/deep-interview-hud.ts";
export * from "./harness/deep-interview/deep-interview-mutation-guard.ts";
export * from "./harness/deep-interview/deep-interview-runtime.ts";
export * from "./harness/deep-interview/deep-interview-state.ts";
export * from "./harness/ralplan/ralplan-agents.ts";
export * from "./harness/ralplan/ralplan-compact.ts";
export * from "./harness/ralplan/ralplan-gates.ts";
export * from "./harness/ralplan/ralplan-hud.ts";
export * from "./harness/ralplan/ralplan-obstacles.ts";
export * from "./harness/ralplan/ralplan-runtime.ts";
export * from "./harness/ralplan/ralplan-verdicts.ts";
export * from "./harness/runtime/endpoint.ts";
export * from "./harness/runtime/gc.ts";
export * from "./harness/runtime/lease.ts";
export * from "./harness/runtime/mutation.ts";
export * from "./harness/runtime/owner.ts";
export * from "./harness/runtime/preservation.ts";
export * from "./harness/runtime/primitives.ts";
export * from "./harness/runtime/receipt-rules.ts";
export * from "./harness/runtime/rpc.ts";
export * from "./harness/runtime/runner.ts";
export * from "./harness/runtime/seams.ts";
export * from "./harness/runtime/state.ts";
export * from "./harness/runtime/storage.ts";
export * from "./harness/runtime/types.ts";
export * from "./harness/runtime/vanish.ts";
export * from "./harness/shared/artifacts/artifact-writer.ts";
export * from "./harness/shared/artifacts/receipts.ts";
export * from "./harness/shared/audit/audit-log.ts";
export * from "./harness/shared/audit/decision-ledger.ts";
export * from "./harness/shared/audit/tamper-detection.ts";
export * from "./harness/shared/audit/transaction-journal.ts";
export * from "./harness/shared/compaction/compact-budget.ts";
export * from "./harness/shared/compaction/compact-state-registry.ts";
export * from "./harness/shared/hud/hud-chips.ts";
export * from "./harness/shared/hud/workflow-hud.ts";
export * from "./harness/shared/orchestration/context-templates.ts";
export * from "./harness/shared/orchestration/expected-next-role.ts";
export * from "./harness/shared/orchestration/gate-verdicts.ts";
export * from "./harness/shared/orchestration/handoff.ts";
export * from "./harness/shared/orchestration/vagueness-gate.ts";
// workflow-tool-utils: avoid re-exporting RalplanApprovalTarget (conflicts with ralplan-runtime)
export {
	type AgentThinkingLevel,
	assertAgentThinkingLevel,
	assertDeepInterviewHandoff,
	assertRalplanApprovalTarget,
	assertRalplanRole,
	type DeepInterviewHandoff,
	requireSubagentManager,
} from "./harness/shared/orchestration/workflow-tool-utils.ts";
export * from "./harness/shared/registry/skill-registry.ts";
export * from "./harness/shared/registry/workflow-manifest.ts";
export * from "./harness/shared/session/paths.ts";
export * from "./harness/shared/session/session-layout.ts";
export * from "./harness/shared/session/session-resolution.ts";
// Runtime modules — re-export everything for external consumers
export * from "./harness/shared/state/active-state.ts";
export * from "./harness/shared/state/state-schema.ts";
export * from "./harness/shared/state/state-writer.ts";
export * from "./harness/shared/state/workflow-id.ts";
export * from "./harness/shared/state/workflow-state.ts";
// Harness runtime
export * from "./harness/team/team-compact.ts";
export * from "./harness/team/team-hud.ts";
export * from "./harness/team/team-runtime.ts";
export * from "./harness/ultragoal/ultragoal-artifacts.ts";
export * from "./harness/ultragoal/ultragoal-compact.ts";
export * from "./harness/ultragoal/ultragoal-guard.ts";
export * from "./harness/ultragoal/ultragoal-hud.ts";
export * from "./harness/ultragoal/ultragoal-obstacles.ts";
export * from "./harness/ultragoal/ultragoal-quality-gate.ts";
// ultragoal-receipt: avoid re-exporting requiredGoals (conflicts with ultragoal-runtime)
export {
	buildCompletionReceipt,
	chooseReceiptKind,
	computeUltragoalPlanGeneration,
	hashStructuredValue,
	latestRelevantLedgerEventId,
	ledgerEventId,
	planSnapshotForReceipt,
	readUltragoalLedger,
	receiptRelevantGoals,
	requiredGoals,
	type UltragoalCompletionVerification,
	type UltragoalGoal,
	type UltragoalGoalMode,
	type UltragoalGoalStatus,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	type UltragoalReceiptDiagnostic,
	type UltragoalReceiptDiagnosticState,
	type UltragoalReceiptKind,
	validateCompletionReceipt,
} from "./harness/ultragoal/ultragoal-receipt.ts";
export * from "./harness/ultragoal/ultragoal-runtime.ts";
