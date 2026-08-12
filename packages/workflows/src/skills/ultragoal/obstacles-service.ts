import type { ObstacleRegression } from "#workflows/audit/decision-ledger";
import {
	appendUltragoalObstacle,
	assertUltragoalObstacle,
	buildUltragoalObstacle,
	ULTRAGOAL_OBSTACLE_KINDS,
	type UltragoalResolvableObstacleKind,
} from "#workflows/skills/ultragoal/obstacles";
import { getUltragoalStatus, readUltragoalPlan } from "#workflows/skills/ultragoal/plan";
import { clampTitle, nowIso } from "#workflows/skills/ultragoal/plan-model";
import { appendLedger, syncUltragoalState, writePlan } from "#workflows/skills/ultragoal/plan-store";
import type {
	UltragoalGoal,
	UltragoalGoalStatus,
	UltragoalLedgerEvent,
	UltragoalPlan,
} from "#workflows/skills/ultragoal/receipt";
import type { UltragoalBlockerClassification } from "#workflows/skills/ultragoal/types";

const BLOCKER_PENDING_STATUSES = new Set<UltragoalGoalStatus>([
	"pending",
	"active",
	"failed",
	"blocked",
	"review_blocked",
]);

function nonEmpty(value: string | undefined, field: string): string {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error(`${field} is required`);
	return trimmed;
}

function replaceGoal(plan: UltragoalPlan, replacement: UltragoalGoal): UltragoalPlan {
	return { ...plan, goals: plan.goals.map((goal) => (goal.id === replacement.id ? replacement : goal)) };
}

function activeRecordedBlocker(plan: UltragoalPlan, blockedGoalId: string): UltragoalGoal | undefined {
	return plan.goals.find(
		(goal) =>
			goal.steering?.kind === "review_blocker" &&
			goal.steering.blockedGoalId === blockedGoalId &&
			BLOCKER_PENDING_STATUSES.has(goal.status),
	);
}

export interface RecordUltragoalObstacleInput {
	goalId: string;
	kind: UltragoalResolvableObstacleKind;
	title: string;
	objective: string;
	evidence: string;
	rationale: string;
	criterion?: string;
	regression?: ObstacleRegression;
}

/** Record one typed obstacle and project its blocker-resolution goal. */
export async function recordUltragoalObstacle(
	cwd: string,
	input: RecordUltragoalObstacleInput,
	sessionId: string,
): Promise<UltragoalPlan> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const goal = plan.goals.find((item) => item.id === input.goalId);
	if (!goal) throw new Error(`unknown ultragoal goal: ${input.goalId}`);
	if (goal.status !== "active") throw new Error("record-obstacle target must be the active goal");
	if (activeRecordedBlocker(plan, goal.id)) throw new Error(`obstacle already recorded for ${goal.id}`);

	if (String(input.kind) === "human_blocked") {
		throw new Error(
			"record-obstacle only accepts resolvable obstacle kinds; use classify-blocker for human blockers",
		);
	}
	if (!Object.hasOwn(ULTRAGOAL_OBSTACLE_KINDS, input.kind)) {
		throw new Error(`unknown ultragoal obstacle kind: ${String(input.kind)}`);
	}
	const title = nonEmpty(input.title, "record-obstacle title");
	const objective = nonEmpty(input.objective, "record-obstacle objective");
	const evidence = nonEmpty(input.evidence, "record-obstacle evidence");
	const rationale = nonEmpty(input.rationale, "record-obstacle rationale");
	const criterion = input.criterion?.trim();
	const now = nowIso();
	const obstacle = buildUltragoalObstacle(
		{
			kind: input.kind,
			name: ULTRAGOAL_OBSTACLE_KINDS[input.kind].label,
			status: "active",
			scope: { goalId: goal.id, ...(criterion ? { criterion } : {}) },
			evidence,
			rationale,
			regression: input.regression,
			originRef: goal.id,
		},
		now,
	);
	assertUltragoalObstacle(obstacle);

	const blockerId = `G${String(plan.goals.length + 1).padStart(3, "0")}`;
	const blockedGoal: UltragoalGoal = { ...goal, status: "review_blocked", updatedAt: now, evidence };
	const blockerGoal: UltragoalGoal = {
		id: blockerId,
		title: clampTitle(title),
		objective,
		status: "pending",
		createdAt: now,
		updatedAt: now,
		steering: { kind: "review_blocker", blockedGoalId: goal.id },
	};
	const nextPlan = replaceGoal({ ...plan, goals: [...plan.goals, blockerGoal], updatedAt: now }, blockedGoal);
	await writePlan(cwd, nextPlan, sessionId);
	await appendUltragoalObstacle(cwd, sessionId, obstacle);
	await appendLedger(
		cwd,
		{ event: "obstacle_recorded", goalId: goal.id, blockerGoalId: blockerId, obstacleId: obstacle.id },
		sessionId,
	);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	return nextPlan;
}

export async function recordUltragoalBlockerClassification(
	cwd: string,
	input: { classification: UltragoalBlockerClassification; evidence: string; goalId?: string },
	sessionId: string,
): Promise<UltragoalLedgerEvent> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	if (input.classification !== "human_blocked" && input.classification !== "resolvable") {
		throw new Error('classify-blocker classification must be "human_blocked" or "resolvable"');
	}
	const evidence = nonEmpty(input.evidence, "classify-blocker evidence");
	const goalId = input.goalId?.trim();
	if (goalId && !plan.goals.some((goal) => goal.id === goalId)) throw new Error(`unknown ultragoal goal: ${goalId}`);
	const event = await appendLedger(
		cwd,
		{
			event: "blocker_classified",
			classification: input.classification,
			...(goalId ? { goalId } : {}),
			evidence,
		},
		sessionId,
	);
	return event as UltragoalLedgerEvent;
}
