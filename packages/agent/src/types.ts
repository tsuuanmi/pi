// Architecture adapted from open-multi-agent (MIT).
import type { Agent } from "#agent/agent/agent";

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskMemoryScope = "dependencies" | "all";
export type DependencyPayload = "output" | "structured" | "both";
export type TaskVerifyOptions = Readonly<Record<string, unknown>>;
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

export interface AgentRunOptions {
	signal?: AbortSignal;
	metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
	success: boolean;
	output: string;
	structured?: unknown;
	error?: unknown;
}

export interface TaskInput {
	id?: string;
	title: string;
	description: string;
	assignee?: string;
	dependsOn?: readonly string[];
	memoryScope?: TaskMemoryScope;
	dependencyPayload?: DependencyPayload;
	role?: string;
	priority?: TaskPriority;
	metadata?: Record<string, unknown>;
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
	requires?: readonly string[];
	verify?: TaskVerifyOptions;
}

export interface TaskSnapshot extends Required<Pick<TaskInput, "title" | "description">> {
	id: string;
	status: TaskStatus;
	assignee?: string;
	dependsOn: readonly string[];
	memoryScope?: TaskMemoryScope;
	dependencyPayload?: DependencyPayload;
	role?: string;
	priority?: TaskPriority;
	metadata?: Record<string, unknown>;
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
	requires: readonly string[];
	verify?: TaskVerifyOptions;
	result?: string;
	structured?: unknown;
	error?: string;
	attempts: number;
	createdAt: string;
	updatedAt: string;
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

export interface Team {
	readonly name: string;
	getAgents(): readonly Agent[];
	getAgent(name: string): Agent | undefined;
}
