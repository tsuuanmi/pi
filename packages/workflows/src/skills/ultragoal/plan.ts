import { ultragoalBriefPath, ultragoalGoalsPath, ultragoalLedgerPath } from "#workflows/session/session-layout";
import {
	chooseNextGoal,
	emptyCounts,
	SCHEDULABLE_STATUSES,
	TERMINAL_STATUSES,
} from "#workflows/skills/ultragoal/goal-selection";
import {
	clampTitle,
	firstNonEmptyLine,
	normalizePlan,
	nowIso,
	parseGoalsFromBrief,
} from "#workflows/skills/ultragoal/plan-model";
import {
	appendLedger,
	latestCheckpointFromLedger,
	planHash,
	syncUltragoalState,
	writePlan,
} from "#workflows/skills/ultragoal/plan-store";
import {
	requiredGoals,
	type UltragoalGoal,
	type UltragoalGoalMode,
	type UltragoalPlan,
} from "#workflows/skills/ultragoal/receipt";
import type { UltragoalStatus } from "#workflows/skills/ultragoal/types";
import { readExistingStateForMutation, readFileOrLiteral } from "#workflows/state/state-writer";

export async function readUltragoalPlan(cwd: string, sessionId: string): Promise<UltragoalPlan | undefined> {
	const read = await readExistingStateForMutation(ultragoalGoalsPath(cwd, sessionId));
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`ultragoal plan is corrupt: ${read.error}`);
	return normalizePlan(read.value);
}

export async function createUltragoalPlan(
	cwd: string,
	input: { brief: string; goalMode?: UltragoalGoalMode },
	sessionId: string,
): Promise<UltragoalPlan> {
	const brief = (await readFileOrLiteral(input.brief, cwd)).trim();
	if (!brief) throw new Error("ultragoal brief is required");
	const now = nowIso();
	const mainGoal = {
		id: "MAIN",
		title: clampTitle(firstNonEmptyLine(brief) ?? "Complete approved goal"),
		objective: brief,
		createdAt: now,
		updatedAt: now,
	};
	const plan: UltragoalPlan = {
		version: 1,
		brief,
		mainGoal,
		goalMode: input.goalMode ?? "aggregate",
		objective: "Complete all approved goals with verification",
		goals: parseGoalsFromBrief(brief).map((goal, index) => ({
			id: `G${String(index + 1).padStart(3, "0")}`,
			title: goal.title,
			objective: goal.objective,
			status: "pending",
			createdAt: now,
			updatedAt: now,
			parentGoalId: mainGoal.id,
			sequence: index + 1,
		})),
		createdAt: now,
		updatedAt: now,
	};
	await writePlan(cwd, plan, sessionId);
	await appendLedger(cwd, { event: "plan_created", goalIds: plan.goals.map((goal) => goal.id) }, sessionId);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	return plan;
}

export async function getUltragoalStatus(cwd: string, sessionId: string): Promise<UltragoalStatus> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	const counts = emptyCounts();
	if (!plan)
		return {
			exists: false,
			status: "missing",
			counts,
			goals: [],
			brief_path: ultragoalBriefPath(cwd, sessionId),
			goals_path: ultragoalGoalsPath(cwd, sessionId),
			ledger_path: ultragoalLedgerPath(cwd, sessionId),
		};
	for (const goal of plan.goals) counts[goal.status] += 1;
	const currentGoal = plan.goals.find((goal) => SCHEDULABLE_STATUSES.has(goal.status));
	let status: UltragoalStatus["status"] = "pending";
	if (plan.goals.length > 0 && requiredGoals(plan).every((goal) => TERMINAL_STATUSES.has(goal.status)))
		status = "complete";
	else if (counts.active > 0) status = "active";
	else if (counts.failed > 0) status = "failed";
	else if (counts.blocked > 0 || counts.review_blocked > 0) status = "blocked";
	return {
		exists: true,
		status,
		mainGoal: plan.mainGoal,
		currentGoal,
		lastCheckpoint: await latestCheckpointFromLedger(cwd, sessionId),
		planHash: planHash(plan),
		counts,
		goals: plan.goals,
		brief_path: ultragoalBriefPath(cwd, sessionId),
		goals_path: ultragoalGoalsPath(cwd, sessionId),
		ledger_path: ultragoalLedgerPath(cwd, sessionId),
	};
}

export async function startNextUltragoalGoal(
	cwd: string,
	retryFailed = false,
	sessionId: string,
): Promise<{ plan: UltragoalPlan; goal?: UltragoalGoal; allComplete: boolean }> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const goal = chooseNextGoal(plan, retryFailed);
	if (!goal) return { plan, allComplete: requiredGoals(plan).every((item) => TERMINAL_STATUSES.has(item.status)) };
	if (goal.status !== "active") {
		const now = nowIso();
		goal.status = "active";
		goal.startedAt = goal.startedAt ?? now;
		goal.updatedAt = now;
		plan.updatedAt = now;
		await writePlan(cwd, plan, sessionId);
		await appendLedger(cwd, { event: "goal_started", goalId: goal.id }, sessionId);
		await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	}
	return { plan, goal, allComplete: false };
}
