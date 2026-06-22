/**
 * Ultragoal guard diagnostics (UG-008).
 *
 * Passive 9-state diagnostic surface plus the entrypoint used by the
 * `ultragoal_guard` tool. The guard reads the plan + ledger, classifies the
 * current objective, and delegates receipt validation to the pure
 * `validateCompletionReceipt` in `ultragoal-receipt.ts`.
 *
 * Acyclic module graph: imports `validateCompletionReceipt` + `readUltragoalLedger`
 * from `ultragoal-receipt.ts` and `readUltragoalPlan` + `requiredGoals` from
 * `ultragoal-runtime.ts`. Runtime MUST NOT import this module (the runtime
 * enforces at the write boundary; the guard is advisory). No back-edge.
 *
 * 9-state enum (per spec amendment): `active_review_blocked_recorded` is omitted
 * because Pi has no review-blocker recording tool; `active_review_blocked_unrecorded`
 * is produced when an active goal is `review_blocked`. `unreadable_fail_closed`
 * covers unreadable plan/ledger while an objective is active.
 */
import { ultragoalGoalsPath, ultragoalLedgerPath } from "../shared/session-layout.ts";
import {
	readUltragoalLedger,
	requiredGoals,
	type UltragoalGoal,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	type UltragoalReceiptKind,
	validateCompletionReceipt,
} from "./ultragoal-receipt.ts";
import { readUltragoalPlan } from "./ultragoal-runtime.ts";

export type UltragoalGuardState =
	| "inactive"
	| "unrelated_goal"
	| "active_verified_complete"
	| "active_missing_receipt"
	| "active_stale_receipt"
	| "active_missing_final_receipt"
	| "active_dirty_quality_gate"
	| "active_review_blocked_unrecorded"
	| "unreadable_fail_closed";

export interface UltragoalGuardDiagnostic {
	state: UltragoalGuardState;
	message: string;
	goalId?: string;
}

export interface UltragoalGuardInput {
	goalId?: string;
	currentObjective?: string;
}

const DEFAULT_OBJECTIVE = "Complete all approved goals with verification";
const TERMINAL_STATUSES = new Set<UltragoalGoal["status"]>(["complete", "superseded"]);

function objectiveMatches(currentObjective: string | undefined, plan: UltragoalPlan): boolean {
	const normalized = (currentObjective ?? "").trim();
	if (!normalized) return false;
	if (normalized === plan.objective || normalized === DEFAULT_OBJECTIVE) return true;
	if (plan.objectiveAliases?.some((alias) => alias === normalized)) return true;
	return plan.goals.some((goal) => goal.objective === normalized);
}

/** Whether `objective` refers to the aggregate run (plan objective / default / alias). */
function isAggregateObjective(objective: string, plan: UltragoalPlan): boolean {
	if (objective === plan.objective || objective === DEFAULT_OBJECTIVE) return true;
	return plan.objectiveAliases?.some((alias) => alias === objective) ?? false;
}

/**
 * Find the goal whose receipt is relevant to the current objective (Gajae parity).
 *
 * Uses the NARROWER aggregate condition (`plan.objective || DEFAULT || aliases`),
 * NOT `objectiveMatches` (which also matches any goal's objective). A story
 * objective that matches a goal's own objective text must take the per-goal
 * branch, not the final-aggregate branch.
 */
function findReceiptGoal(
	plan: UltragoalPlan,
	currentObjective: string | undefined,
): { goal: UltragoalGoal; receiptKind: UltragoalReceiptKind } | null {
	const objective = (currentObjective ?? "").trim();
	if (isAggregateObjective(objective, plan)) {
		const finalGoal = [...requiredGoals(plan)]
			.reverse()
			.find((goal) => goal.completionVerification?.receiptKind === "final-aggregate");
		return finalGoal ? { goal: finalGoal, receiptKind: "final-aggregate" } : null;
	}
	const storyGoal = plan.goals.find((goal) => goal.objective === objective);
	return storyGoal ? { goal: storyGoal, receiptKind: "per-goal" } : null;
}

/**
 * Read ultragoal verification state and classify it into a guard diagnostic.
 *
 * Classification order (matches Gajae precedence, adapted to the 9-state enum):
 *  1. unreadable plan/ledger while an objective is active -> `unreadable_fail_closed`
 *  2. no plan / no current goal -> `inactive` or `unrelated_goal`
 *  3. active goal `review_blocked` -> `active_review_blocked_unrecorded`
 *  4. receipt validation via `validateCompletionReceipt` -> map receipt states
 *     to guard states (missing/stale/dirty/verified; final-aggregate distinct).
 */
export async function readUltragoalVerificationState(
	cwd: string,
	sessionId?: string,
	input: UltragoalGuardInput = {},
): Promise<UltragoalGuardDiagnostic> {
	let plan: UltragoalPlan | undefined;
	try {
		plan = await readUltragoalPlan(cwd, sessionId);
	} catch (error) {
		return {
			state: "unreadable_fail_closed",
			message: `Unable to read ultragoal plan: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	let ledger: UltragoalLedgerEvent[];
	try {
		ledger = await readUltragoalLedger(cwd, sessionId);
	} catch (error) {
		if (error instanceof UltragoalLedgerUnreadable) {
			return { state: "unreadable_fail_closed", message: error.message };
		}
		return {
			state: "unreadable_fail_closed",
			message: `Unable to read ultragoal ledger at ${ultragoalLedgerPath(cwd, sessionId)}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	if (!plan) return { state: "inactive", message: "No ultragoal plan exists." };
	// Focused per-goal inspection: when a specific goalId is requested, classify
	// that goal's receipt directly (no aggregate incomplete-goals check — that is
	// a run-level concern for the objective path below).
	if (input.goalId) {
		const goal = plan.goals.find((item) => item.id === input.goalId);
		if (!goal) return { state: "unrelated_goal", message: `No ultragoal goal found for ${input.goalId}.` };
		if (goal.status === "review_blocked") {
			return {
				state: "active_review_blocked_unrecorded",
				message: `Ultragoal ${goal.id} is review-blocked; record and resolve blocker work, then rerun verification.`,
				goalId: goal.id,
			};
		}
		const receiptKind: UltragoalReceiptKind = goal.completionVerification?.receiptKind ?? "per-goal";
		const receipt = validateCompletionReceipt({ plan, ledger, goal, receiptKind });
		return { state: receipt.state, message: receipt.message, goalId: receipt.goalId };
	}
	// Objective-driven classification (matches Gajae precedence).
	const currentObjective = input.currentObjective ?? plan.objective;
	if (!objectiveMatches(currentObjective, plan)) {
		return { state: "unrelated_goal", message: "Current goal is not an active ultragoal objective." };
	}
	if (plan.goals.some((goal) => goal.status === "review_blocked")) {
		return {
			state: "active_review_blocked_unrecorded",
			message: "Ultragoal has review-blocked goals; record and resolve blocker work, then rerun verification.",
		};
	}
	const target = findReceiptGoal(plan, currentObjective);
	if (!target) {
		return {
			state: "active_missing_final_receipt",
			message: "Ultragoal aggregate completion requires a fresh final aggregate receipt.",
		};
	}
	const receipt = validateCompletionReceipt({
		plan,
		ledger,
		goal: target.goal,
		receiptKind: target.receiptKind,
	});
	if (receipt.state !== "active_verified_complete") {
		return { state: receipt.state, message: receipt.message, goalId: receipt.goalId };
	}
	const incompleteGoals = requiredGoals(plan).filter((goal) => !TERMINAL_STATUSES.has(goal.status));
	if (incompleteGoals.length > 0) {
		return {
			state: "active_missing_final_receipt",
			message: `Ultragoal still has incomplete required goals: ${incompleteGoals.map((goal) => goal.id).join(", ")}.`,
			goalId: target.goal.id,
		};
	}
	return { state: receipt.state, message: receipt.message, goalId: receipt.goalId };
}

/** Entrypoint for the `ultragoal_guard` tool. */
export async function ultragoalGuard(
	cwd: string,
	sessionId?: string | UltragoalGuardInput,
	input: UltragoalGuardInput = {},
): Promise<UltragoalGuardDiagnostic & { ledger_path: string; goals_path: string }> {
	const effectiveSessionId = typeof sessionId === "string" ? sessionId : undefined;
	const effectiveInput = typeof sessionId === "object" && sessionId !== null ? sessionId : input;
	const diagnostic = await readUltragoalVerificationState(cwd, effectiveSessionId, effectiveInput);
	return {
		...diagnostic,
		ledger_path: ultragoalLedgerPath(cwd, effectiveSessionId),
		goals_path: ultragoalGoalsPath(cwd, effectiveSessionId),
	};
}
