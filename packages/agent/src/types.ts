// Architecture adapted from open-multi-agent (MIT).
import type { LlmAdapter, LlmResponse, LlmToolDefinition } from "@tsuuanmi/pi-ai";

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";
export type SchedulingStrategy = "round-robin" | "least-busy" | "dependency-first" | "capability-match";

export interface ToolDefinition extends LlmToolDefinition {
	execute?: (args: Record<string, unknown>, context: TaskExecutionContext) => Promise<string> | string;
}

export interface AgentConfig {
	name: string;
	instructions?: string;
	model?: string;
	adapter: LlmAdapter;
	tools?: readonly ToolDefinition[];
	capabilities?: readonly string[];
	maxConcurrentTasks?: number;
}

export interface AgentRunOptions {
	signal?: AbortSignal;
	metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
	success: boolean;
	output: string;
	response?: LlmResponse;
	error?: unknown;
}

export interface TaskInput {
	id?: string;
	title: string;
	description: string;
	assignee?: string;
	dependsOn?: readonly string[];
	requires?: readonly string[];
	metadata?: Record<string, unknown>;
}

export interface TaskSnapshot extends Required<Pick<TaskInput, "title" | "description">> {
	id: string;
	status: TaskStatus;
	assignee?: string;
	dependsOn: readonly string[];
	requires: readonly string[];
	metadata?: Record<string, unknown>;
	result?: string;
	error?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TaskExecutionContext {
	task: TaskSnapshot;
	agent: Agent;
	team: Team;
	completedDependencies: readonly TaskSnapshot[];
}

export interface RunTeamOptions {
	strategy?: SchedulingStrategy;
	maxConcurrency?: number;
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

export interface Agent {
	readonly name: string;
	run(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult>;
}

export interface Team {
	readonly name: string;
	getAgents(): readonly Agent[];
	getAgent(name: string): Agent | undefined;
}
