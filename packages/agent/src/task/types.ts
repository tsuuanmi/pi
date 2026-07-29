export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked" | "skipped";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskMemoryScope = "dependencies" | "all";
export type DependencyPayload = "output" | "structured" | "both";
export type TaskVerifyOptions = Readonly<Record<string, unknown>>;
export type TaskMetadata = Readonly<Record<string, unknown>>;

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
	requires?: readonly string[];
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
	requires: readonly string[];
	verify?: TaskVerifyOptions;
	consequential?: boolean;
	result?: string;
	structured?: unknown;
	error?: string;
	attempts: number;
	createdAt: string;
	updatedAt: string;
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
