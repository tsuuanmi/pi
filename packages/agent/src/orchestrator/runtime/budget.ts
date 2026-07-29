import type { RunBudget } from "#agent/orchestrator/types";
import type { OrchestratorRunContext } from "#agent/orchestrator/runtime/context";

export interface BudgetState {
	taskStarts: number;
	startedAtMs: number;
}

export function resolveRunBudget(budget?: Partial<RunBudget>): RunBudget | undefined {
	if (budget === undefined) return undefined;
	const resolved: RunBudget = {};
	if (budget.maxTaskStarts !== undefined)
		resolved.maxTaskStarts = validateBudgetValue(budget.maxTaskStarts, "maxTaskStarts");
	if (budget.maxRunMs !== undefined) resolved.maxRunMs = validateBudgetValue(budget.maxRunMs, "maxRunMs");
	return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function initializeBudgetState(taskStarts: number): BudgetState {
	return {
		taskStarts,
		startedAtMs: Date.now(),
	};
}

export function recordTaskStart(state: BudgetState): void {
	state.taskStarts += 1;
}

export function isRunBudgetExceeded(context: OrchestratorRunContext): string | undefined {
	const budget = context.runBudget;
	if (budget?.maxTaskStarts !== undefined && context.budget.taskStarts >= budget.maxTaskStarts) {
		return `Run budget exceeded: maxTaskStarts=${budget.maxTaskStarts}.`;
	}
	if (budget?.maxRunMs !== undefined) {
		const elapsed = Date.now() - context.budget.startedAtMs;
		if (elapsed > budget.maxRunMs) return `Run budget exceeded: maxRunMs=${budget.maxRunMs}.`;
	}
	return undefined;
}

export function emitBudgetExceeded(context: OrchestratorRunContext, message: string): void {
	context.emit({
		type: "budget_exceeded",
		message,
		data: context.budget,
	});
	context.emitTrace({
		type: "budget_exceeded",
		runStatus: context.aborted ? "aborted" : "running",
		message,
		data: context.budget,
	});
}

function validateBudgetValue(value: number, field: string): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`Run budget ${field} must be a finite non-negative number.`);
	}
	return Math.floor(value);
}
