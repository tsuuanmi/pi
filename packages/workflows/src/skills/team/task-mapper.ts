import type { TaskInput, TaskSnapshot } from "@tsuuanmi/pi-orchestrator";
import { mapExecutionStatus } from "#workflows/skills/team/status-mapper";
import type { TeamTask } from "#workflows/skills/team/team-runtime";

export interface TeamTaskRoute {
	assignee?: string;
	capabilities?: readonly string[];
	tools?: readonly string[];
	maxRetries?: number;
	retryDelayMs?: number;
	retryBackoff?: number;
}

export interface TeamTaskMapInput {
	tasks: readonly TeamTask[];
	routes?: Readonly<Record<string, TeamTaskRoute>>;
}

export interface TeamTaskMapResult {
	tasks: readonly TaskInput[];
}

export function mapTeamTasks(input: TeamTaskMapInput): TeamTaskMapResult {
	return Object.freeze({
		tasks: Object.freeze(input.tasks.map((task) => mapTeamTask(task, input.routes?.[task.id]))),
	});
}

export function mapTeamTask(task: TeamTask, route: TeamTaskRoute = {}): TaskInput {
	const id = requiredString(task.id, "task.id");
	const title = requiredString(task.title, "task.title");
	const description = requiredString(task.description, "task.description");
	const dependsOn = cloneStrings(task.depends_on, "task.depends_on");
	const blockedBy = cloneStrings(task.blocked_by, "task.blocked_by");
	if (blockedBy && blockedBy.length > 0) {
		throw new Error(`workflow task ${id} has unresolved blockers: ${blockedBy.join(", ")}`);
	}
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

export function mapTaskExecution(snapshot: TaskSnapshot): Pick<TeamTask, "id" | "execution"> {
	return Object.freeze({
		id: snapshot.id,
		execution: Object.freeze({
			status: mapExecutionStatus(snapshot.status),
			updated_at: snapshot.updatedAt,
			receipt_ids: [],
			...(snapshot.error ? { error: snapshot.error } : {}),
		}),
	});
}

function cloneStrings(value: readonly string[] | undefined, field: string): readonly string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	return Object.freeze(value.map((item, index) => requiredString(item, `${field}[${index}]`)));
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new Error(`${field} must be non-empty`);
	if (trimmed !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
	if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${field} must be a non-negative integer`);
	return Number(value);
}

function positiveNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${field} must be a positive number`);
	}
	return value;
}
