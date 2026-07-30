import type {
	TaskExecutionReceipt,
	TaskInput,
	TaskQueueEvent,
	TaskSnapshot,
	TaskStatus,
} from "@tsuuanmi/pi-orchestrator";
import type { TeamTask, TeamTaskStatus } from "#workflows/skills/team/team-runtime";

export interface TeamTaskRoute {
	assignee?: string;
	capabilities?: readonly string[];
	tools?: readonly string[];
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
}

export interface TeamTaskReceiptRef {
	package: "@tsuuanmi/pi-orchestrator";
	type: "task";
	id: string;
}

export interface TeamEvent {
	type:
		| "team_task_ready"
		| "team_task_started"
		| "team_task_completed"
		| "team_task_failed"
		| "team_task_skipped"
		| "team_task_blocked"
		| "team_all_complete";
	taskId?: string;
	status?: TeamTaskStatus;
	message?: string;
	timestamp: string;
}

export interface TeamOrchestratorAdapterInput {
	tasks: readonly TeamTask[];
	routes?: Readonly<Record<string, TeamTaskRoute>>;
}

export interface TeamOrchestratorAdapterResult {
	tasks: readonly TaskInput[];
}

export function mapTeamTasks(input: TeamOrchestratorAdapterInput): TeamOrchestratorAdapterResult {
	return Object.freeze({
		tasks: Object.freeze(input.tasks.map((task) => mapTeamTask(task, input.routes?.[task.id]))),
	});
}

export function mapTeamTask(task: TeamTask, route: TeamTaskRoute = {}): TaskInput {
	const id = requiredString(task.id, "task.id");
	const title = requiredString(task.title, "task.title");
	const description = requiredString(task.description, "task.description");
	const dependsOn = cloneStrings(task.depends_on, "task.depends_on");
	const capabilities = cloneStrings(route.capabilities, "route.capabilities");
	const tools = cloneStrings(route.tools, "route.tools");
	return Object.freeze({
		id,
		title,
		description,
		...((route.assignee ?? task.assignee)
			? { assignee: requiredString(route.assignee ?? task.assignee, "route.assignee") }
			: {}),
		...(dependsOn ? { dependsOn } : {}),
		requires: Object.freeze({
			...(capabilities ? { capabilities } : {}),
			...(tools ? { tools } : {}),
		}),
		...(route.maxRetries !== undefined
			? { maxRetries: nonNegativeInteger(route.maxRetries, "route.maxRetries") }
			: {}),
		...(route.retryDelayMs !== undefined
			? { retryDelayMs: nonNegativeInteger(route.retryDelayMs, "route.retryDelayMs") }
			: {}),
		...(route.retryBackoff !== undefined
			? { retryBackoff: positiveNumber(route.retryBackoff, "route.retryBackoff") }
			: {}),
		metadata: Object.freeze({ workflowTaskId: id, ...(task.owner ? { owner: task.owner } : {}) }),
	});
}

export function mapTaskStatus(status: TaskStatus): TeamTaskStatus {
	switch (status) {
		case "pending":
			return "pending";
		case "in_progress":
			return "in_progress";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "blocked":
			return "blocked";
		case "skipped":
			throw new Error("orchestrator status skipped has no team task status mapping");
	}
}

export function mapQueueEvent(event: TaskQueueEvent): TeamEvent {
	const taskId = event.task?.id;
	const status = event.task && event.task.status !== "skipped" ? mapTaskStatus(event.task.status) : undefined;
	const base = {
		...(taskId ? { taskId } : {}),
		...(status ? { status } : {}),
		...(event.message ? { message: event.message } : {}),
		timestamp: event.timestamp,
	};
	switch (event.type) {
		case "task_ready":
			return Object.freeze({ ...base, type: "team_task_ready" });
		case "task_start":
			return Object.freeze({ ...base, type: "team_task_started" });
		case "task_complete":
			return Object.freeze({ ...base, type: "team_task_completed" });
		case "task_fail":
			return Object.freeze({ ...base, type: "team_task_failed" });
		case "task_skip":
			return Object.freeze({ ...base, type: "team_task_skipped" });
		case "task_block":
			return Object.freeze({ ...base, type: "team_task_blocked" });
		case "all_complete":
			return Object.freeze({ ...base, type: "team_all_complete" });
	}
}

export function mapTaskReceipt(receipt: TaskExecutionReceipt): TeamTaskReceiptRef {
	return Object.freeze({
		package: "@tsuuanmi/pi-orchestrator",
		type: "task",
		id: requiredString(receipt.taskId, "receipt.taskId"),
	});
}

export function mapTaskSnapshot(
	snapshot: TaskSnapshot,
): Pick<TeamTask, "id" | "status" | "updated_at" | "completed_at"> {
	const status = mapTaskStatus(snapshot.status);
	return Object.freeze({
		id: snapshot.id,
		status,
		updated_at: snapshot.updatedAt,
		...(status === "completed" ? { completed_at: snapshot.updatedAt } : {}),
	});
}

function cloneStrings(value: readonly string[] | undefined, field: string): readonly string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	return Object.freeze(value.map((item, index) => requiredString(item, `${field}[${index}]`)));
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	const text = value.trim();
	if (text.length === 0) throw new Error(`${field} must be non-empty`);
	return text;
}

function nonNegativeInteger(value: unknown, field: string): number {
	if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${field} must be a non-negative integer`);
	return Number(value);
}

function positiveNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
		throw new Error(`${field} must be a positive number`);
	return value;
}
