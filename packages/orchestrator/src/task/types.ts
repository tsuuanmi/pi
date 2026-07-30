export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked" | "skipped";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskMemoryScope = "dependencies" | "all";
export type DependencyPayload = "output" | "structured" | "both";
export type TaskVerifyOptions = Readonly<Record<string, unknown>>;
export type TaskMetadata = Readonly<Record<string, unknown>>;

export interface TaskRequirements {
	capabilities?: readonly string[];
	tools?: readonly string[];
	provider?: string;
	api?: string;
	model?: string;
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
	metadata?: TaskMetadata;
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
	requires?: TaskRequirements;
	verify?: TaskVerifyOptions;
	consequential?: boolean;
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
	metadata?: TaskMetadata;
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
	requires: TaskRequirements;
	verify?: TaskVerifyOptions;
	consequential?: boolean;
	result?: string;
	structured?: unknown;
	error?: string;
	attempts: number;
	createdAt: string;
	updatedAt: string;
}

export type TaskQueueEventName =
	| "task_ready"
	| "task_start"
	| "task_complete"
	| "task_fail"
	| "task_skip"
	| "task_block"
	| "all_complete";

export interface TaskQueueEvent {
	type: TaskQueueEventName;
	task?: TaskSnapshot;
	message?: string;
	timestamp: string;
}

export interface TaskQueueProgress {
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
	failed: number;
	blocked: number;
	skipped: number;
}

export interface TaskQueueSnapshot {
	version: 1;
	tasks: readonly TaskSnapshot[];
	pending: readonly string[];
	inProgress: readonly string[];
	completed: readonly string[];
	failed: readonly string[];
	blocked: readonly string[];
	skipped: readonly string[];
}
