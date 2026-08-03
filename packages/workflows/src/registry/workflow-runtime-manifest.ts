import type {
	WorkflowRetentionPolicy,
	WorkflowRuntimeManifest,
	WorkflowStateOperation,
	WorkflowStateValidationContext,
	WorkflowTransition,
} from "#workflows/registry/workflow-manifest-types";
import type { WorkflowSkill } from "#workflows/session/paths";

const STATE_RETENTION: WorkflowRetentionPolicy = { category: "state", keep: 1 };
const ARTIFACT_RETENTION: WorkflowRetentionPolicy = { category: "artifact" };
const LEDGER_RETENTION: WorkflowRetentionPolicy = { category: "ledger" };
const AGENTS_RETENTION: WorkflowRetentionPolicy = { category: "agents" };

function transition(from: string, to: string, operations: readonly WorkflowStateOperation[]): WorkflowTransition {
	return { from, to, operations };
}

function samePhase(states: readonly string[]): WorkflowTransition[] {
	return states.map((state) => transition(state, state, ["write", "replace", "runtime-sync"]));
}

function fromStates(
	states: readonly string[],
	to: string,
	operations: readonly WorkflowStateOperation[],
): WorkflowTransition[] {
	return states.map((from) => transition(from, to, operations));
}

const DEEP_INTERVIEW_STATES = ["interviewing", "handoff", "complete"] as const;
const RALPLAN_STATES = [
	"planner",
	"architect",
	"critic",
	"revision",
	"expert-stage",
	"adr",
	"pending-approval",
	"final",
	"handoff",
	"approved",
	"rejected",
	"complete",
	"failed",
	"cancelled",
] as const;
const ULTRAGOAL_STATES = [
	"approved-execution",
	"missing",
	"pending",
	"active",
	"blocked",
	"failed",
	"complete",
	"handoff",
] as const;
const TEAM_STATES = [
	"approved-execution",
	"starting",
	"running",
	"awaiting_integration",
	"complete",
	"failed",
	"cancelled",
	"handoff",
	"missing",
] as const;

export const PI_WORKFLOW_RUNTIME_MANIFEST = {
	"deep-interview": {
		skill: "deep-interview",
		states: DEEP_INTERVIEW_STATES,
		initialState: "interviewing",
		terminalStates: ["handoff", "complete"],
		clearState: "complete",
		transitions: [
			...samePhase(DEEP_INTERVIEW_STATES),
			transition("interviewing", "handoff", ["write", "replace", "handoff-send"]),
			transition("interviewing", "complete", ["replace", "clear"]),
			transition("handoff", "complete", ["write", "clear"]),
			transition("complete", "complete", ["clear"]),
			...fromStates(DEEP_INTERVIEW_STATES, "handoff", ["handoff-receive"]),
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION],
		hudFields: ["current_phase", "ambiguity_score", "threshold", "spec_slug", "spec_path", "topology"],
		graphLabel: "Deep Interview",
	},
	ralplan: {
		skill: "ralplan",
		states: RALPLAN_STATES,
		initialState: "planner",
		terminalStates: ["handoff", "approved", "rejected", "complete", "failed", "cancelled"],
		clearState: "complete",
		transitions: [
			...samePhase(RALPLAN_STATES),
			transition("planner", "architect", ["write", "replace"]),
			transition("architect", "critic", ["write", "replace"]),
			transition("critic", "revision", ["write", "replace"]),
			transition("planner", "revision", ["write", "replace"]),
			transition("revision", "architect", ["write", "replace"]),
			transition("planner", "expert-stage", ["write", "replace"]),
			transition("architect", "expert-stage", ["write", "replace"]),
			transition("critic", "expert-stage", ["write", "replace"]),
			transition("revision", "expert-stage", ["write", "replace"]),
			transition("critic", "pending-approval", ["write", "replace"]),
			transition("architect", "pending-approval", ["write", "replace"]),
			transition("planner", "pending-approval", ["write", "replace"]),
			transition("revision", "pending-approval", ["write", "replace"]),
			transition("pending-approval", "handoff", ["write", "handoff-send"]),
			transition("pending-approval", "approved", ["write"]),
			transition("pending-approval", "rejected", ["write"]),
			transition("handoff", "planner", ["write", "replace", "handoff-receive"]),
			transition("approved", "planner", ["write", "replace", "handoff-receive"]),
			transition("rejected", "planner", ["write", "replace", "handoff-receive"]),
			transition("complete", "planner", ["write", "replace", "handoff-receive"]),
			transition("failed", "planner", ["write", "replace", "handoff-receive"]),
			transition("cancelled", "planner", ["write", "replace", "handoff-receive"]),
			...fromStates(RALPLAN_STATES, "handoff", ["handoff-send", "handoff-receive"]),
			...fromStates(RALPLAN_STATES, "complete", ["clear"]),
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION, AGENTS_RETENTION],
		hudFields: ["current_phase", "run_id", "stage", "stage_n", "plan_path", "pending_approval_path"],
		graphLabel: "Ralplan",
	},
	ultragoal: {
		skill: "ultragoal",
		states: ULTRAGOAL_STATES,
		initialState: "approved-execution",
		terminalStates: ["missing", "failed", "complete", "handoff"],
		clearState: "complete",
		transitions: [
			...samePhase(ULTRAGOAL_STATES),
			transition("approved-execution", "missing", ["runtime-sync"]),
			transition("approved-execution", "pending", ["runtime-sync", "write"]),
			transition("approved-execution", "active", ["runtime-sync", "write"]),
			transition("missing", "pending", ["runtime-sync", "replace"]),
			transition("pending", "active", ["runtime-sync", "write"]),
			transition("active", "pending", ["runtime-sync"]),
			transition("active", "blocked", ["runtime-sync", "write"]),
			transition("active", "failed", ["runtime-sync", "write"]),
			transition("active", "complete", ["runtime-sync", "write"]),
			transition("blocked", "active", ["runtime-sync", "write"]),
			transition("failed", "active", ["runtime-sync", "write"]),
			transition("failed", "pending", ["runtime-sync", "replace"]),
			transition("blocked", "pending", ["runtime-sync", "replace"]),
			transition("complete", "pending", ["runtime-sync", "replace"]),
			...fromStates(ULTRAGOAL_STATES, "handoff", ["handoff-send", "handoff-receive"]),
			...fromStates(ULTRAGOAL_STATES, "approved-execution", ["handoff-receive"]),
			...fromStates(ULTRAGOAL_STATES, "complete", ["clear"]),
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION],
		hudFields: [
			"current_phase",
			"main_goal_id",
			"current_goal_id",
			"last_checkpoint_id",
			"last_checkpoint_path",
			"plan_hash",
			"restore_warning",
			"status",
			"counts",
			"ledger_path",
			"brief_path",
		],
		graphLabel: "Ultragoal",
	},
	team: {
		skill: "team",
		states: TEAM_STATES,
		initialState: "approved-execution",
		terminalStates: ["complete", "failed", "cancelled", "handoff", "missing"],
		clearState: "complete",
		transitions: [
			...samePhase(TEAM_STATES),
			transition("approved-execution", "missing", ["runtime-sync"]),
			transition("approved-execution", "running", ["runtime-sync", "write", "replace"]),
			transition("missing", "running", ["runtime-sync", "replace"]),
			transition("starting", "running", ["runtime-sync", "write"]),
			transition("running", "awaiting_integration", ["runtime-sync", "write"]),
			transition("awaiting_integration", "running", ["runtime-sync", "write"]),
			transition("running", "complete", ["runtime-sync", "write"]),
			transition("awaiting_integration", "complete", ["runtime-sync", "write"]),
			transition("running", "failed", ["runtime-sync", "write"]),
			transition("running", "cancelled", ["runtime-sync", "write"]),
			transition("complete", "running", ["runtime-sync", "replace"]),
			transition("failed", "running", ["runtime-sync", "replace"]),
			transition("cancelled", "running", ["runtime-sync", "replace"]),
			...fromStates(TEAM_STATES, "handoff", ["handoff-send", "handoff-receive"]),
			...fromStates(TEAM_STATES, "approved-execution", ["handoff-receive"]),
			...fromStates(TEAM_STATES, "complete", ["clear"]),
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION],
		hudFields: ["current_phase", "team_name", "workers", "task_counts", "phase", "integration"],
		graphLabel: "Team",
	},
} as const satisfies Record<WorkflowSkill, WorkflowRuntimeManifest>;

export const PI_WORKFLOW_RUNTIME_SKILLS = Object.keys(PI_WORKFLOW_RUNTIME_MANIFEST) as WorkflowSkill[];

export function getWorkflowRuntimeManifest(skill: WorkflowSkill): WorkflowRuntimeManifest {
	return PI_WORKFLOW_RUNTIME_MANIFEST[skill];
}

export function isKnownWorkflowPhase(skill: WorkflowSkill, phase: string): boolean {
	return getWorkflowRuntimeManifest(skill).states.includes(phase);
}

export function initialWorkflowPhase(skill: WorkflowSkill): string {
	return getWorkflowRuntimeManifest(skill).initialState;
}

export function clearWorkflowPhase(skill: WorkflowSkill): string {
	return getWorkflowRuntimeManifest(skill).clearState;
}

export function isValidWorkflowTransition(
	skill: WorkflowSkill,
	from: string,
	to: string,
	context: WorkflowStateValidationContext,
): boolean {
	if (context.force) return true;
	return getWorkflowRuntimeManifest(skill).transitions.some(
		(item) => item.from === from && item.to === to && item.operations.includes(context.operation),
	);
}
