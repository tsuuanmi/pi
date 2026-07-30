import type { TaskSnapshot } from "#orchestrator/task/types";
import type { Team } from "#orchestrator/team/team";

export interface RunFacts {
	teamName: string;
	agentNames: readonly string[];
	taskIds: readonly string[];
	startedAt: string;
}

export function createRunFacts(
	team: Team,
	tasks: readonly Pick<TaskSnapshot, "id">[],
	startedAt = new Date().toISOString(),
): RunFacts {
	const teamName = normalizeNonEmptyString(team.name, "teamName");
	const agentNames = Object.freeze(team.getAgents().map((agent) => normalizeNonEmptyString(agent.name, "agentName")));
	const taskIds = Object.freeze(tasks.map((task) => normalizeNonEmptyString(task.id, "taskId")));
	return Object.freeze({ teamName, agentNames, taskIds, startedAt: normalizeTimestamp(startedAt, "startedAt") });
}

export function normalizeRunFacts(value: unknown): RunFacts {
	const facts = asRecord(value, "Run facts");
	return Object.freeze({
		teamName: normalizeNonEmptyString(facts.teamName, "teamName"),
		agentNames: normalizeStringArray(facts.agentNames, "agentNames"),
		taskIds: normalizeStringArray(facts.taskIds, "taskIds"),
		startedAt: normalizeTimestamp(facts.startedAt, "startedAt"),
	});
}

export function assertResumeFacts(checkpointFacts: RunFacts, requestedFacts: RunFacts): void {
	assertEqual(checkpointFacts.teamName, requestedFacts.teamName, "team name");
	assertStringArrays(checkpointFacts.agentNames, requestedFacts.agentNames, "agent roster");
	assertStringArrays(checkpointFacts.taskIds, requestedFacts.taskIds, "task ids");
}

function assertEqual(left: string, right: string, label: string): void {
	if (left !== right) throw new Error(`Checkpoint run facts ${label} mismatch: ${left} !== ${right}.`);
}

function assertStringArrays(left: readonly string[], right: readonly string[], label: string): void {
	if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
		throw new Error(`Checkpoint run facts ${label} mismatch: ${left.join(",")} !== ${right.join(",")}.`);
	}
}

function normalizeStringArray(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value)) throw new Error(`Run facts ${field} must be an array.`);
	return Object.freeze(value.map((item) => normalizeNonEmptyString(item, field)));
}

function normalizeTimestamp(value: unknown, field: string): string {
	const timestamp = normalizeNonEmptyString(value, field);
	if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Run facts ${field} must be a valid ISO timestamp.`);
	return timestamp;
}

function normalizeNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new Error(`Run facts ${field} must be a non-empty string.`);
	return value;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error(`${label} must be an object.`);
	return value as Record<string, unknown>;
}
