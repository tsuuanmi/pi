import type { WorkflowSkill } from "#workflows/harness/shared/session/paths";

export type WorkflowStateOperation =
	| "initialize"
	| "write"
	| "replace"
	| "clear"
	| "handoff-send"
	| "handoff-receive"
	| "runtime-sync"
	| "force-repair";

export interface WorkflowTransition {
	from: string | "*";
	to: string;
	operations: readonly WorkflowStateOperation[];
	verb?: string;
	compatibility?: boolean;
	reason?: string;
}

export interface WorkflowVerb {
	name: string;
}

export interface WorkflowTypedArg {
	name: string;
	type: "string" | "number" | "boolean" | "enum" | "object";
	enumValues?: string[];
	required?: boolean;
	appliesToVerbs?: string[];
}

export interface WorkflowRetentionPolicy {
	category: string;
	keep?: number;
	maxAgeDays?: number;
}

export interface WorkflowManifest {
	skill: WorkflowSkill;
	states: readonly string[];
	initialState: string;
	terminalStates: readonly string[];
	clearState: string;
	transitions: readonly WorkflowTransition[];
	verbs: readonly WorkflowVerb[];
	typedArgs: readonly WorkflowTypedArg[];
	retention: readonly WorkflowRetentionPolicy[];
	hudFields: readonly string[];
	graphLabel: string;
}

const STATE_RETENTION: WorkflowRetentionPolicy = { category: "state", keep: 1 };
const ARTIFACT_RETENTION: WorkflowRetentionPolicy = { category: "artifact" };
const LEDGER_RETENTION: WorkflowRetentionPolicy = { category: "ledger" };
const AGENTS_RETENTION: WorkflowRetentionPolicy = { category: "agents" };

function transition(
	from: string | "*",
	to: string,
	operations: readonly WorkflowStateOperation[],
	options: Omit<WorkflowTransition, "from" | "to" | "operations"> = {},
): WorkflowTransition {
	return { from, to, operations, ...options };
}

function samePhaseTransitions(states: readonly string[]): WorkflowTransition[] {
	return states.map((state) => transition(state, state, ["write", "replace", "runtime-sync"]));
}

export const PI_WORKFLOW_MANIFEST = {
	"deep-interview": {
		skill: "deep-interview",
		states: ["interviewing", "handoff", "complete"],
		initialState: "interviewing",
		terminalStates: ["handoff", "complete"],
		clearState: "complete",
		transitions: [
			...samePhaseTransitions(["interviewing", "handoff", "complete"]),
			transition("interviewing", "handoff", ["write", "replace", "handoff-send"]),
			transition("interviewing", "complete", ["replace"]),
			transition("handoff", "complete", ["write", "clear"]),
			transition("interviewing", "complete", ["clear"]),
			transition("*", "complete", ["clear"]),
			transition("*", "handoff", ["handoff-receive"], { compatibility: true }),
		],
		verbs: [
			{ name: "plan-question" },
			{ name: "record-answer" },
			{ name: "record-scoring" },
			{ name: "read-compact" },
			{ name: "closure-check" },
			{ name: "restate-goal" },
			{ name: "write-spec" },
		],
		typedArgs: [
			{ name: "quick", type: "boolean" },
			{ name: "standard", type: "boolean" },
			{ name: "deep", type: "boolean" },
			{ name: "threshold", type: "number" },
			{ name: "handoff", type: "enum", enumValues: ["ralplan", "team", "ultragoal", "stop"] },
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION],
		hudFields: ["current_phase", "ambiguity_score", "threshold", "spec_slug", "spec_path", "topology"],
		graphLabel: "Deep Interview",
	},
	ralplan: {
		skill: "ralplan",
		states: [
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
			"completed",
			"failed",
			"cancelled",
			"canceled",
			"inactive",
		],
		initialState: "planner",
		terminalStates: [
			"handoff",
			"approved",
			"rejected",
			"complete",
			"completed",
			"failed",
			"cancelled",
			"canceled",
			"inactive",
		],
		clearState: "complete",
		transitions: [
			...samePhaseTransitions([
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
				"completed",
				"failed",
				"cancelled",
				"canceled",
				"inactive",
			]),
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
			transition("completed", "planner", ["write", "replace", "handoff-receive"]),
			transition("failed", "planner", ["write", "replace", "handoff-receive"]),
			transition("cancelled", "planner", ["write", "replace", "handoff-receive"]),
			transition("canceled", "planner", ["write", "replace", "handoff-receive"]),
			transition("inactive", "planner", ["write", "replace", "handoff-receive"]),
			transition("*", "handoff", ["handoff-send", "handoff-receive"], { compatibility: true }),
			transition("*", "complete", ["clear"]),
		],
		verbs: [
			{ name: "record-explorer-gate" },
			{ name: "run-agent" },
			{ name: "write-artifact" },
			{ name: "status" },
			{ name: "read-compact" },
			{ name: "doctor" },
			{ name: "approve-plan" },
		],
		typedArgs: [
			{
				name: "stage",
				type: "enum",
				enumValues: ["planner", "architect", "critic", "revision", "expert-stage", "adr", "final"],
			},
			{ name: "stageN", type: "number" },
			{ name: "runId", type: "string" },
			{ name: "approved", type: "boolean" },
			{ name: "target", type: "enum", enumValues: ["ultragoal", "team", "stop"] },
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION, AGENTS_RETENTION],
		hudFields: ["current_phase", "run_id", "stage", "stage_n", "plan_path", "pending_approval_path"],
		graphLabel: "Ralplan",
	},
	ultragoal: {
		skill: "ultragoal",
		states: ["approved-execution", "missing", "pending", "active", "blocked", "failed", "complete", "handoff"],
		initialState: "approved-execution",
		terminalStates: ["missing", "failed", "complete", "handoff"],
		clearState: "complete",
		transitions: [
			...samePhaseTransitions([
				"approved-execution",
				"missing",
				"pending",
				"active",
				"blocked",
				"failed",
				"complete",
				"handoff",
			]),
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
			transition("*", "handoff", ["handoff-send", "handoff-receive"], { compatibility: true }),
			transition("*", "approved-execution", ["handoff-receive"]),
			transition("*", "complete", ["clear"]),
		],
		verbs: [
			{ name: "create-plan" },
			{ name: "status" },
			{ name: "read-compact" },
			{ name: "start-next" },
			{ name: "checkpoint" },
			{ name: "record-review-blockers" },
			{ name: "classify-blocker" },
			{ name: "guard" },
			{ name: "spawn-goal-agent" },
		],
		typedArgs: [
			{ name: "brief", type: "string" },
			{ name: "goalMode", type: "enum", enumValues: ["aggregate", "per-story"] },
			{ name: "goalId", type: "string" },
			{ name: "status", type: "string" },
			{ name: "receiptKind", type: "enum", enumValues: ["per-goal", "final-aggregate"] },
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION],
		hudFields: ["current_phase", "current_goal_id", "status", "counts", "ledger_path", "brief_path"],
		graphLabel: "Ultragoal",
	},
	team: {
		skill: "team",
		states: [
			"approved-execution",
			"starting",
			"running",
			"awaiting_integration",
			"complete",
			"failed",
			"cancelled",
			"handoff",
			"missing",
		],
		initialState: "approved-execution",
		terminalStates: ["complete", "failed", "cancelled", "handoff", "missing"],
		clearState: "complete",
		transitions: [
			...samePhaseTransitions([
				"approved-execution",
				"starting",
				"running",
				"awaiting_integration",
				"complete",
				"failed",
				"cancelled",
				"handoff",
				"missing",
			]),
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
			transition("*", "handoff", ["handoff-send", "handoff-receive"], { compatibility: true }),
			transition("*", "approved-execution", ["handoff-receive"]),
			transition("*", "complete", ["clear"]),
		],
		verbs: [
			{ name: "start" },
			{ name: "snapshot" },
			{ name: "read-compact" },
			{ name: "create-task" },
			{ name: "transition-task" },
			{ name: "send-message" },
			{ name: "record-review-gate" },
			{ name: "record-completion-gate" },
			{ name: "complete" },
			{ name: "spawn-task-agent" },
		],
		typedArgs: [
			{ name: "task", type: "string" },
			{ name: "teamId", type: "string" },
			{ name: "taskId", type: "string" },
			{ name: "status", type: "string" },
		],
		retention: [STATE_RETENTION, ARTIFACT_RETENTION, LEDGER_RETENTION],
		hudFields: ["current_phase", "team_name", "workers", "task_counts", "phase", "integration"],
		graphLabel: "Team",
	},
} as const satisfies Record<WorkflowSkill, WorkflowManifest>;

export const PI_WORKFLOW_SKILLS = Object.keys(PI_WORKFLOW_MANIFEST) as WorkflowSkill[];

export function getWorkflowManifest(skill: WorkflowSkill): WorkflowManifest {
	return PI_WORKFLOW_MANIFEST[skill];
}

export function isKnownWorkflowPhase(skill: WorkflowSkill, phase: string): boolean {
	return getWorkflowManifest(skill).states.includes(phase);
}

export function initialWorkflowPhase(skill: WorkflowSkill): string {
	return getWorkflowManifest(skill).initialState;
}

export function clearWorkflowPhase(skill: WorkflowSkill): string {
	return getWorkflowManifest(skill).clearState;
}

export interface WorkflowStateValidationContext {
	operation: WorkflowStateOperation;
	command: string;
	force: boolean;
}

export function isValidWorkflowTransition(
	skill: WorkflowSkill,
	from: string,
	to: string,
	context: WorkflowStateValidationContext,
): boolean {
	if (context.force) return true;
	return getWorkflowManifest(skill).transitions.some(
		(item) =>
			(item.from === "*" || item.from === from) && item.to === to && item.operations.includes(context.operation),
	);
}

export function typedArgsForWorkflowVerb(skill: WorkflowSkill, verb: string): WorkflowTypedArg[] {
	return getWorkflowManifest(skill).typedArgs.filter(
		(arg) => arg.appliesToVerbs === undefined || arg.appliesToVerbs.includes(verb),
	);
}
