import type { Agent } from "#agent/agent/agent";
import type { TaskInput, TaskSnapshot } from "#agent/task/types";
import type { Team } from "#agent/team/team";

export type SchedulingStrategy = "round-robin" | "least-busy" | "dependency-first" | "capability-match" | "composite";

export interface SchedulingWeights {
	fit: number;
	load: number;
}

export interface SchedulerWarning {
	code: "NO_ELIGIBLE_AGENT";
	message: string;
	taskId: string;
	taskTitle: string;
	reasons: readonly string[];
	fallback: "zero-fit-current-load";
}

export interface TaskExecutionContext {
	task: TaskSnapshot;
	agent: Agent;
	team: Team;
	completedDependencies: readonly TaskSnapshot[];
}

export interface OrchestratorConfig {
	strategy?: SchedulingStrategy;
	maxConcurrency?: number;
	schedulingWeights?: Partial<SchedulingWeights>;
	onWarning?: (warning: SchedulerWarning) => void;
}

export interface RunTeamOptions {
	strategy?: SchedulingStrategy;
	maxConcurrency?: number;
	schedulingWeights?: Partial<SchedulingWeights>;
	onWarning?: (warning: SchedulerWarning) => void;
	signal?: AbortSignal;
	onTaskStart?: (task: TaskSnapshot) => void;
	onTaskComplete?: (task: TaskSnapshot) => void;
	onTaskFail?: (task: TaskSnapshot) => void;
}

export interface RunTeamResult {
	success: boolean;
	tasks: readonly TaskSnapshot[];
	output: string;
}

export type { TaskInput, TaskSnapshot };
