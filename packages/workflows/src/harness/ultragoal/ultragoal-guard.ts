/**
 * Ultragoal guard diagnostics (UG-008).
 *
 * Passive 9-state diagnostic surface plus the entrypoint used by the
 * `pi workflow ultragoal guard` control-plane action. The guard reads the plan + ledger, classifies the
 * current objective, and delegates receipt validation to the pure
 * `validateCompletionReceipt` in `ultragoal-receipt.ts`.
 *
 * Acyclic module graph: imports `validateCompletionReceipt` + `readUltragoalLedger`
 * from `ultragoal-receipt.ts` and `readUltragoalPlan` + `requiredGoals` from
 * `ultragoal-runtime.ts`. Runtime MUST NOT import this module (the runtime
 * enforces at the write boundary; the guard is advisory). No back-edge.
 *
 * 10-state enum: `active_review_blocked_recorded` is produced when a
 * `review_blocked` goal has a matching durable blocker-resolution goal and
 * `review_blockers_recorded` ledger event; `active_review_blocked_unrecorded`
 * covers manual/legacy review-blocked state. `unreadable_fail_closed` covers
 * unreadable plan/ledger while an objective is active.
 */

import type { ObstacleTrigger } from "#src/harness/shared/audit/decision-ledger";
import { ultragoalGoalsPath, ultragoalLedgerPath } from "#src/harness/shared/session/session-layout";
import {
	readUltragoalObstacleLedger,
	type UltragoalObstacleLedger,
	unresolvedUltragoalObstacles,
} from "#src/harness/ultragoal/ultragoal-obstacles";
import {
	readUltragoalLedger,
	requiredGoals,
	type UltragoalGoal,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	type UltragoalReceiptKind,
	validateCompletionReceipt,
} from "#src/harness/ultragoal/ultragoal-receipt";
import { readUltragoalPlan } from "#src/harness/ultragoal/ultragoal-runtime";

export type UltragoalGuardState =
	| "inactive"
	| "unrelated_goal"
	| "active_verified_complete"
	| "active_missing_receipt"
	| "active_stale_receipt"
	| "active_missing_final_receipt"
	| "active_dirty_quality_gate"
	| "active_review_blocked_unrecorded"
	| "active_review_blocked_recorded"
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
 *  3. active goal `review_blocked` -> recorded/unrecorded review-blocked state
 *  4. receipt validation via `validateCompletionReceipt` -> map receipt states
 *     to guard states (missing/stale/dirty/verified; final-aggregate distinct).
 */
function hasRecordedReviewBlocker(
	plan: UltragoalPlan,
	ledger: readonly UltragoalLedgerEvent[],
	blockedGoalId: string,
): boolean {
	const event = ledger.find(
		(row) =>
			row.event === "review_blockers_recorded" &&
			row.goalId === blockedGoalId &&
			typeof row.blockerGoalId === "string",
	);
	if (!event || typeof event.blockerGoalId !== "string") return false;
	return plan.goals.some(
		(goal) =>
			goal.id === event.blockerGoalId &&
			goal.steering?.kind === "review_blocker" &&
			goal.steering.blockedGoalId === blockedGoalId &&
			goal.status !== "complete" &&
			goal.status !== "superseded",
	);
}

function reviewBlockedDiagnostic(
	plan: UltragoalPlan,
	ledger: readonly UltragoalLedgerEvent[],
	obstacleLedger: UltragoalObstacleLedger,
	goal: UltragoalGoal,
): UltragoalGuardDiagnostic {
	const recorded = hasRecordedReviewBlocker(plan, ledger, goal.id);
	const obstacles = unresolvedUltragoalObstacles(obstacleLedger, { scope: { goalId: goal.id } });
	assertObstacleAgreement(goal.id, recorded, obstacles);
	if (recorded) {
		return {
			state: "active_review_blocked_recorded",
			message: `Ultragoal ${goal.id} has recorded review blockers; complete blocker work and rerun verification.`,
			goalId: goal.id,
		};
	}
	return {
		state: "active_review_blocked_unrecorded",
		message: `Ultragoal ${goal.id} is review-blocked without a recorded blocker goal; record and resolve blocker work, then rerun verification.`,
		goalId: goal.id,
	};
}

/**
 * Phase B-1: verify the obstacle ledger agrees with the graph-walk, but ONLY
 * when the obstacle ledger has spoken (non-empty unresolved obstacles for this
 * goal). The legacy `recordUltragoalReviewBlockers` path writes no obstacle, so
 * an empty ledger is normal and the graph-walk stays authoritative. The B-0
 * dual-write (`recordUltragoalObstacle`) writes both, so they must agree; a
 * divergence here is a bug. In dev/test we throw (catch it early); in production
 * we log so the advisory guard never breaks the run.
 */
function assertObstacleAgreement(goalId: string, recorded: boolean, obstacles: readonly ObstacleTrigger[]): void {
	if (obstacles.length === 0 || recorded) return;
	const message =
		`ultragoal obstacle/graph-walk divergence on ${goalId}: ` +
		`obstacle ledger has ${obstacles.length} unresolved obstacle(s) but no recorded review-blocker goal`;
	if (process.env.NODE_ENV !== "production") {
		throw new Error(message);
	}
	console.warn(message);
}

export async function readUltragoalVerificationState(
	cwd: string,
	sessionId: string,
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
	// Phase B-1: read the obstacle ledger alongside the graph-walk. Fail-soft to
	// empty so the obstacle ledger can never break the existing guard path.
	let obstacleLedger: UltragoalObstacleLedger;
	try {
		obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
	} catch {
		obstacleLedger = { obstacles: [] };
	}
	if (!plan) return { state: "inactive", message: "No ultragoal plan exists." };
	// Focused per-goal inspection: when a specific goalId is requested, classify
	// that goal's receipt directly (no aggregate incomplete-goals check — that is
	// a run-level concern for the objective path below).
	if (input.goalId) {
		const goal = plan.goals.find((item) => item.id === input.goalId);
		if (!goal) return { state: "unrelated_goal", message: `No ultragoal goal found for ${input.goalId}.` };
		if (goal.status === "review_blocked") return reviewBlockedDiagnostic(plan, ledger, obstacleLedger, goal);
		const receiptKind: UltragoalReceiptKind = goal.completionVerification?.receiptKind ?? "per-goal";
		const receipt = validateCompletionReceipt({ plan, ledger, goal, receiptKind });
		return { state: receipt.state, message: receipt.message, goalId: receipt.goalId };
	}
	// Objective-driven classification (matches Gajae precedence).
	const currentObjective = input.currentObjective ?? plan.objective;
	if (!objectiveMatches(currentObjective, plan)) {
		return { state: "unrelated_goal", message: "Current goal is not an active ultragoal objective." };
	}
	const reviewBlocked = plan.goals.find((goal) => goal.status === "review_blocked");
	if (reviewBlocked) return reviewBlockedDiagnostic(plan, ledger, obstacleLedger, reviewBlocked);
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

/** Entrypoint for the `pi workflow ultragoal guard` control-plane action. */
export async function ultragoalGuard(
	cwd: string,
	sessionId: string,
	input: UltragoalGuardInput = {},
): Promise<UltragoalGuardDiagnostic & { ledger_path: string; goals_path: string }> {
	const diagnostic = await readUltragoalVerificationState(cwd, sessionId, input);
	return {
		...diagnostic,
		ledger_path: ultragoalLedgerPath(cwd, sessionId),
		goals_path: ultragoalGoalsPath(cwd, sessionId),
	};
}
