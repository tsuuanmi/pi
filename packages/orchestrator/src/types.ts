import type { Agent } from "@tsuuanmi/pi-agent";
import type { OrchestratorCheckpointStore } from "#orchestrator/runtime/checkpoint";
import type { RunFacts } from "#orchestrator/runtime/facts";
import type { RunIdentity } from "#orchestrator/runtime/identity";
import type { TaskExecutionReceipt } from "#orchestrator/runtime/receipt";
import type { TaskInput, TaskQueueSnapshot, TaskSnapshot } from "#orchestrator/task/types";
import type { Team } from "#orchestrator/team/team";

export type SchedulingStrategy = "round-robin" | "least-busy" | "dependency-first" | "capability-match" | "composite";

export interface SchedulingWeights {
	fit: number;
	load: number;
}

export interface TaskExecutionContext {
	task: TaskSnapshot;
	team: Team;
	completedDependencies: readonly TaskSnapshot[];
	attempt: number;
}

export interface TaskVerificationContext extends TaskExecutionContext {
	agent: string;
	output: string;
	structured?: unknown;
}

export type TaskFailureAction = "retry" | "fail" | "skip" | "abort";
export type TaskRetryClassification = "transient" | "capacity" | "dependency" | "policy" | "unknown";

export interface RetryDecision {
	attempt: number;
	nextAttempt: number;
	exponentialDelayMs: number;
	jitterRatio: number;
	jitterMs: number;
	delayMs: number;
}

export interface TaskFailureContext extends TaskExecutionContext {
	agent: string;
	error: unknown;
	output: string;
	structured?: unknown;
}

export interface TaskExecutionMetrics {
	startedAt: string;
	completedAt: string;
	durationMs: number;
	attempts: number;
	retries: number;
}

export interface OrchestratorEvent {
	type:
		| "task_start"
		| "task_complete"
		| "task_retry"
		| "task_skipped"
		| "task_verify"
		| "task_consequential"
		| "error"
		| "budget_exceeded";
	timestamp: string;
	runIdentity?: RunIdentity;
	taskId?: string;
	taskTitle?: string;
	agent?: string;
	message?: string;
	data?: unknown;
}

export interface OrchestratorTraceEvent {
	type:
		| "plan_start"
		| "plan_complete"
		| "plan_abort"
		| "plan_error"
		| "consensus_start"
		| "consensus_vote"
		| "consensus_complete"
		| "consensus_error"
		| "run_start"
		| "run_complete"
		| "run_abort"
		| "routing_decision"
		| "task_dispatch"
		| "task_start"
		| "task_complete"
		| "task_retry"
		| "task_skipped"
		| "task_verify"
		| "task_consequential"
		| "task_short_circuit"
		| "checkpoint_save"
		| "checkpoint_save_error"
		| "budget_exceeded"
		| "error";
	timestamp: string;
	runIdentity?: RunIdentity;
	runStatus?: "running" | "completed" | "aborted";
	taskId?: string;
	taskTitle?: string;
	agent?: string;
	message?: string;
	data?: unknown;
}

export interface RunBudget {
	maxTaskStarts?: number;
	maxRunMs?: number;
}

export interface PlanOptions {
	coordinator: Agent;
	abortSignal?: AbortSignal;
	onTrace?: (event: OrchestratorTraceEvent) => void;
}

export interface PlanResult {
	goal: string;
	tasks: readonly TaskInput[];
	rawOutput: string;
}

export interface ConsensusVerifierOptions {
	judges: readonly Agent[];
	minApprovals: number;
	abortSignal?: AbortSignal;
	onTrace?: (event: OrchestratorTraceEvent) => void;
}

export interface ConsensusVote {
	judge: string;
	approved: boolean;
	reason: string;
	rawOutput: string;
}

export interface ConsensusResult {
	approved: boolean;
	votes: readonly ConsensusVote[];
	approvals: number;
	rejections: number;
}

export interface OrchestratorConfig {
	schedulingStrategy?: SchedulingStrategy;
	maxConcurrency?: number;
	schedulingWeights?: Partial<SchedulingWeights>;
	runBudget?: Partial<RunBudget>;
	checkpointStore?: OrchestratorCheckpointStore;
	runIdentity?: RunIdentity;
	onProgress?: (event: OrchestratorEvent) => void;
	onTrace?: (event: OrchestratorTraceEvent) => void;
	onTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	onTaskConsequential?: (task: Readonly<TaskSnapshot>) => boolean | Promise<boolean>;
	onTaskRetryClassify?: (context: TaskFailureContext) => TaskRetryClassification | Promise<TaskRetryClassification>;
	onTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
}

export interface RunTeamOptions {
	schedulingStrategy?: SchedulingStrategy;
	maxConcurrency?: number;
	schedulingWeights?: Partial<SchedulingWeights>;
	runBudget?: Partial<RunBudget>;
	checkpointStore?: OrchestratorCheckpointStore;
	runIdentity?: RunIdentity;
	abortSignal?: AbortSignal;
	onProgress?: (event: OrchestratorEvent) => void;
	onTrace?: (event: OrchestratorTraceEvent) => void;
	onTaskVerify?: (context: TaskVerificationContext) => boolean | Promise<boolean>;
	onTaskConsequential?: (task: Readonly<TaskSnapshot>) => boolean | Promise<boolean>;
	onTaskRetryClassify?: (context: TaskFailureContext) => TaskRetryClassification | Promise<TaskRetryClassification>;
	onTaskFailure?: (context: TaskFailureContext) => TaskFailureAction | Promise<TaskFailureAction>;
	onTaskDispatch?: (task: Readonly<TaskSnapshot>) => boolean | Promise<boolean>;
	onTaskStart?: (task: TaskSnapshot) => void;
	onTaskComplete?: (task: TaskSnapshot) => void;
}

export interface RunTeamResult {
	status: "completed" | "aborted";
	success: boolean;
	abortedReason?: string;
	runIdentity: RunIdentity;
	runFacts: RunFacts;
	tasks: readonly TaskSnapshot[];
	metrics: Readonly<Record<string, TaskExecutionMetrics>>;
	receipts: Readonly<Record<string, TaskExecutionReceipt>>;
	output: string;
}

export interface OrchestratorCheckpointSnapshot {
	version: 4;
	status: "running" | "completed" | "aborted";
	runIdentity: RunIdentity;
	runFacts: RunFacts;
	tasks: TaskQueueSnapshot;
	metrics: Readonly<Record<string, TaskExecutionMetrics>>;
	receipts: Readonly<Record<string, TaskExecutionReceipt>>;
	taskStarts: number;
	updatedAt: string;
	abortedReason?: string;
}

export type {
	OrchestratorCheckpointStore,
	RunFacts,
	RunIdentity,
	TaskExecutionReceipt,
	TaskInput,
	TaskQueueSnapshot,
	TaskSnapshot,
};
