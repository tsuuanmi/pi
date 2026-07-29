import type { TaskInput, TaskPriority } from "#agent/task/types";
import type { Team } from "#agent/team/team";
import { isAbortError, OrchestratorAbortError } from "#agent/orchestrator/execution/retry";
import type { PlanOptions, PlanResult } from "#agent/orchestrator/types";

export async function planTasks(team: Team, goal: string, options: PlanOptions): Promise<PlanResult> {
	const normalizedGoal = normalizeGoal(goal);
	const coordinator = options.coordinator;
	if (!coordinator) throw new Error("Planning requires an explicit coordinator agent.");
	const prompt = buildPlannerPrompt(team, normalizedGoal);
	options.onTrace?.({ type: "plan_start", timestamp: new Date().toISOString(), message: normalizedGoal });
	if (options.abortSignal?.aborted) {
		const error = new OrchestratorAbortError();
		options.onTrace?.({ type: "plan_abort", timestamp: new Date().toISOString(), message: error.message });
		throw error;
	}
	let result: { success: boolean; output: string; structured?: unknown; error?: unknown };
	try {
		result = await coordinator.run(prompt, {
			signal: options.abortSignal,
			metadata: { phase: "orchestrator-plan" },
		});
	} catch (error) {
		if (options.abortSignal?.aborted || isAbortError(error)) {
			const abortError = new OrchestratorAbortError();
			options.onTrace?.({ type: "plan_abort", timestamp: new Date().toISOString(), message: abortError.message });
			throw abortError;
		}
		const message = formatPlannerFailure(error, "");
		options.onTrace?.({ type: "plan_error", timestamp: new Date().toISOString(), message });
		throw new Error(message);
	}
	if (!result.success) {
		if (options.abortSignal?.aborted || isAbortError(result.error)) {
			const error = new OrchestratorAbortError();
			options.onTrace?.({ type: "plan_abort", timestamp: new Date().toISOString(), message: error.message });
			throw error;
		}
		const message = formatPlannerFailure(result.error, result.output);
		options.onTrace?.({ type: "plan_error", timestamp: new Date().toISOString(), message });
		throw new Error(message);
	}
	const tasks = parsePlanOutput(result.output, team);
	options.onTrace?.({
		type: "plan_complete",
		timestamp: new Date().toISOString(),
		message: normalizedGoal,
		data: { taskCount: tasks.length },
	});
	return {
		goal: normalizedGoal,
		tasks,
		rawOutput: result.output,
	};
}

function buildPlannerPrompt(team: Team, goal: string): string {
	const roster = team
		.getAgents()
		.map(
			(agent) =>
				`- ${agent.name}: ${agent.capabilities.length > 0 ? agent.capabilities.join(", ") : "no declared capabilities"}`,
		)
		.join("\n");
	return [
		"You are a strict task planner.",
		"Return ONLY a JSON array. Do not wrap it in prose.",
		"Each task object must include string fields: id, title, description.",
		"Optional fields: assignee, dependsOn, requires, role, priority, memoryScope, dependencyPayload, maxRetries, retryDelayMs, retryBackoff, verify, metadata.",
		"dependsOn must contain task ids from the same JSON array, never titles.",
		"assignee must match one of the roster agent names exactly when present.",
		"Do not invent undeclared agent names.",
		"",
		"Roster:",
		roster,
		"",
		"Goal:",
		goal,
	].join("\n");
}

function parsePlanOutput(output: string, team: Team): readonly TaskInput[] {
	const parsed = parseJsonArray(output);
	const roster = new Set(team.getAgents().map((agent) => agent.name));
	const ids = new Set<string>();
	const tasks = parsed.map((item, index) => normalizeTask(item, index, roster));
	for (const task of tasks) {
		if (ids.has(task.id!)) throw new Error(`Planner output contains duplicate task id: ${task.id}`);
		ids.add(task.id!);
	}
	for (const task of tasks) {
		for (const dependency of task.dependsOn ?? []) {
			if (!ids.has(dependency)) {
				throw new Error(`Planner task "${task.id}" depends on unknown task id: ${dependency}`);
			}
			if (dependency === task.id) throw new Error(`Planner task "${task.id}" cannot depend on itself.`);
		}
	}
	assertAcyclicPlan(tasks);
	return Object.freeze(tasks);
}

function assertAcyclicPlan(tasks: readonly TaskInput[]): void {
	const byId = new Map(tasks.map((task) => [task.id!, task]));
	const state = new Map<string, "visiting" | "visited">();
	const visit = (id: string, path: readonly string[]): void => {
		const currentState = state.get(id);
		if (currentState === "visited") return;
		if (currentState === "visiting") {
			const cycleStart = path.indexOf(id);
			const cycle = [...path.slice(cycleStart), id];
			throw new Error(`Planner output contains cyclic dependencies: ${cycle.join(" -> ")}`);
		}
		state.set(id, "visiting");
		const task = byId.get(id)!;
		for (const dependency of task.dependsOn ?? []) visit(dependency, [...path, id]);
		state.set(id, "visited");
	};
	for (const task of tasks) visit(task.id!, []);
}

function normalizeTask(item: unknown, index: number, roster: ReadonlySet<string>): TaskInput {
	const task = asRecord(item, `Planner task at index ${index}`);
	const id = requiredString(task.id, `Planner task at index ${index} id`);
	const title = requiredString(task.title, `Planner task "${id}" title`);
	const description = requiredString(task.description, `Planner task "${id}" description`);
	const assignee = optionalString(task.assignee, `Planner task "${id}" assignee`);
	if (assignee !== undefined && !roster.has(assignee)) {
		throw new Error(`Planner task "${id}" uses unknown assignee: ${assignee}`);
	}
	return {
		id,
		title,
		description,
		...(assignee !== undefined ? { assignee } : {}),
		...(task.dependsOn !== undefined
			? { dependsOn: stringArray(task.dependsOn, `Planner task "${id}" dependsOn`) }
			: {}),
		...(task.requires !== undefined ? { requires: stringArray(task.requires, `Planner task "${id}" requires`) } : {}),
		...(task.role !== undefined ? { role: requiredString(task.role, `Planner task "${id}" role`) } : {}),
		...(task.priority !== undefined ? { priority: priority(task.priority, id) } : {}),
		...(task.memoryScope !== undefined
			? { memoryScope: enumValue(task.memoryScope, ["dependencies", "all"], `Planner task "${id}" memoryScope`) }
			: {}),
		...(task.dependencyPayload !== undefined
			? {
					dependencyPayload: enumValue(
						task.dependencyPayload,
						["output", "structured", "both"],
						`Planner task "${id}" dependencyPayload`,
					),
				}
			: {}),
		...(task.maxRetries !== undefined
			? { maxRetries: nonNegativeNumber(task.maxRetries, `Planner task "${id}" maxRetries`) }
			: {}),
		...(task.retryDelayMs !== undefined
			? { retryDelayMs: nonNegativeNumber(task.retryDelayMs, `Planner task "${id}" retryDelayMs`) }
			: {}),
		...(task.retryBackoff !== undefined
			? { retryBackoff: minNumber(task.retryBackoff, 1, `Planner task "${id}" retryBackoff`) }
			: {}),
		...(task.verify !== undefined ? { verify: plainObject(task.verify, `Planner task "${id}" verify`) } : {}),
		...(task.metadata !== undefined ? { metadata: plainObject(task.metadata, `Planner task "${id}" metadata`) } : {}),
	};
}

function parseJsonArray(output: string): unknown[] {
	const trimmed = output.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
	const candidate = fenced ? fenced[1]!.trim() : trimmed;
	let parsed: unknown;
	try {
		parsed = JSON.parse(candidate);
	} catch (error) {
		throw new Error(`Planner output must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Array.isArray(parsed)) throw new Error("Planner output must be a JSON array of tasks.");
	if (parsed.length === 0) throw new Error("Planner output must contain at least one task.");
	return parsed;
}

function normalizeGoal(goal: string): string {
	const normalized = goal.trim();
	if (normalized.length === 0) throw new Error("Planning goal must be a non-empty string.");
	return normalized;
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
	return value;
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	return requiredString(value, label);
}

function stringArray(value: unknown, label: string): readonly string[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings.`);
	return Object.freeze(value.map((item, index) => requiredString(item, `${label}[${index}]`)));
}

function priority(value: unknown, id: string): TaskPriority {
	return enumValue(value, ["low", "normal", "high", "critical"], `Planner task "${id}" priority`);
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[], label: string): T {
	if (typeof value === "string" && allowed.includes(value as T)) return value as T;
	throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
}

function nonNegativeNumber(value: unknown, label: string): number {
	return minNumber(value, 0, label);
}

function minNumber(value: unknown, min: number, label: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
		throw new Error(`${label} must be a finite number greater than or equal to ${min}.`);
	}
	return value;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
	const record = asRecord(value, label);
	return Object.freeze({ ...record });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error(`${label} must be an object.`);
	return value as Record<string, unknown>;
}

function formatPlannerFailure(error: unknown, output: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.length > 0) return error;
	return output || String(error);
}
