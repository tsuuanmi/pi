import { randomUUID } from "node:crypto";
import { resolveUltragoalObstacles } from "#workflows/skills/ultragoal/obstacles";
import { getUltragoalStatus, readUltragoalPlan } from "#workflows/skills/ultragoal/plan";
import { isPlainObject, normalizePlan, nowIso, parseGoalStatus } from "#workflows/skills/ultragoal/plan-model";
import {
	appendLedger,
	latestCheckpointFromLedger,
	planHash,
	planIdentity,
	syncUltragoalState,
	writeCheckpointSnapshot,
	writePlan,
} from "#workflows/skills/ultragoal/plan-store";
import { validateCompletionQualityGate } from "#workflows/skills/ultragoal/quality-gate/validation";
import {
	buildCompletionReceipt,
	chooseReceiptKind,
	hashStructuredValue,
	readUltragoalLedger,
	type UltragoalGoal,
	type UltragoalGoalStatus,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	validateCompletionReceipt,
} from "#workflows/skills/ultragoal/receipt";
import type { UltragoalCheckpointSummary } from "#workflows/skills/ultragoal/types";
import { readExistingStateForMutation, sha256 } from "#workflows/state/state-writer";

function validateCompletionEvidence(evidence: string): void {
	const trimmed = evidence.trim();
	if (trimmed.length < 32 || trimmed.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length < 5) {
		throw new Error("completion evidence must be substantive");
	}
}

function replaceGoal(plan: UltragoalPlan, replacement: UltragoalGoal): UltragoalPlan {
	return { ...plan, goals: plan.goals.map((goal) => (goal.id === replacement.id ? replacement : goal)) };
}

function replaceGoals(plan: UltragoalPlan, replacements: UltragoalGoal[]): UltragoalPlan {
	const byId = new Map(replacements.map((goal) => [goal.id, goal]));
	return { ...plan, goals: plan.goals.map((goal) => byId.get(goal.id) ?? goal) };
}

function currentActiveGoal(plan: UltragoalPlan): UltragoalGoal | undefined {
	const active = plan.goals.filter((goal) => goal.status === "active");
	return active.length === 1 ? active[0] : undefined;
}

async function assertFailedBlockedAuthorized(
	cwd: string,
	sessionId: string,
	plan: UltragoalPlan,
	goal: UltragoalGoal,
	status: UltragoalGoalStatus,
): Promise<void> {
	if (status !== "failed" && status !== "blocked") return;
	if (goal.status !== "active") {
		throw new Error("failed/blocked checkpoints require the target goal to be active");
	}
	let ledger: UltragoalLedgerEvent[];
	try {
		ledger = await readUltragoalLedger(cwd, sessionId);
	} catch (error) {
		if (error instanceof UltragoalLedgerUnreadable) throw error;
		throw new Error(`unable to read ultragoal ledger for blocker classification: ${String(error)}`);
	}
	const latest = ledger.at(-1);
	if (latest?.event !== "blocker_classified" || latest.classification !== "human_blocked") {
		throw new Error(
			"failed/blocked checkpoints require the immediate latest blocker_classified human_blocked ledger event",
		);
	}
	if (typeof latest.goalId === "string" && latest.goalId.trim().length > 0) {
		if (latest.goalId !== goal.id)
			throw new Error("latest human_blocked classification goalId does not match checkpoint goal");
		return;
	}
	const active = currentActiveGoal(plan);
	if (!active || active.id !== goal.id) {
		throw new Error("goal-less human_blocked classification only authorizes the current active goal");
	}
}

export interface UltragoalCheckpointInput {
	goalId: string;
	status: string;
	evidence?: string;
	qualityGate?: unknown;
}

export async function checkpointUltragoalGoal(
	cwd: string,
	input: UltragoalCheckpointInput,
	sessionId: string,
): Promise<UltragoalGoal> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const status = parseGoalStatus(input.status);
	const goal = plan.goals.find((item) => item.id === input.goalId);
	if (!goal) throw new Error(`unknown ultragoal goal: ${input.goalId}`);
	const beforeStatus = goal.status;
	const now = nowIso();

	if (status === "complete") {
		validateCompletionEvidence(input.evidence ?? "");
		const typedQualityGate = await validateCompletionQualityGate(cwd, input.qualityGate);
		const priorLedger = await readUltragoalLedger(cwd, sessionId);
		const goalJson: Record<string, unknown> = {
			...goal,
			status,
			updatedAt: now,
			completedAt: now,
			evidence: input.evidence?.trim(),
			completionVerification: undefined,
		};
		let supersededGoalJson: Record<string, unknown> | undefined;
		let supersessionEvidence: string | undefined;
		let transitionPlan = replaceGoal(plan, goalJson as unknown as UltragoalGoal);
		if (goal.steering?.kind === "review_blocker" && goal.steering.blockedGoalId) {
			const blockedGoal = plan.goals.find((item) => item.id === goal.steering?.blockedGoalId);
			if (!blockedGoal || blockedGoal.status !== "review_blocked") {
				throw new Error("review-blocker completion requires the blocked goal to still be review_blocked");
			}
			supersessionEvidence = `Resolved by verification blocker story ${goal.id}: ${input.evidence?.trim()}`;
			supersededGoalJson = { ...blockedGoal, status: "superseded", updatedAt: now, evidence: supersessionEvidence };
			transitionPlan = replaceGoals(transitionPlan, [supersededGoalJson as unknown as UltragoalGoal]);
		}
		transitionPlan.updatedAt = now;
		const transitionGoal = transitionPlan.goals.find((item) => item.id === goal.id)!;
		const receiptKind = chooseReceiptKind(transitionPlan, transitionGoal, status);
		const qualityGateJson: Record<string, unknown> = typedQualityGate as unknown as Record<string, unknown>;
		const checkpointLedgerEventId = randomUUID();
		const transitionJson = supersededGoalJson ? { goalJson, supersededGoalJson } : goalJson;
		const receipt = buildCompletionReceipt({
			plan: transitionPlan,
			ledger: priorLedger,
			goal: goal,
			receiptKind,
			beforeStatus,
			qualityGateJson,
			goalJson,
			transitionJson,
			now,
			checkpointLedgerEventId,
		});
		const completedGoal: UltragoalGoal = {
			...(goalJson as unknown as UltragoalGoal),
			completionVerification: receipt,
		};
		const finalPlan = replaceGoal(transitionPlan, completedGoal);
		const event = {
			eventId: checkpointLedgerEventId,
			event: "goal_checkpointed",
			goalId: goal.id,
			status,
			statusBefore: beforeStatus,
			evidenceSha256: input.evidence ? sha256(input.evidence) : undefined,
			qualityGateJson,
			goalJson,
			supersededGoalId: supersededGoalJson ? goal.steering?.blockedGoalId : undefined,
			supersededGoalJson,
			supersessionEvidence,
			completionVerification: receipt,
		};
		const diagnostic = validateCompletionReceipt({
			plan: finalPlan,
			ledger: [...priorLedger, event],
			goal: completedGoal,
			receiptKind,
		});
		if (diagnostic.state !== "active_verified_complete") {
			throw new Error(`ultragoal complete checkpoint refused before mutation: ${diagnostic.message}`);
		}
		await appendLedger(cwd, event, sessionId);
		await writePlan(cwd, finalPlan, sessionId);
		await writeCheckpointSnapshot(cwd, sessionId, finalPlan, completedGoal, checkpointLedgerEventId);
		if (goal.steering?.kind === "review_blocker" && goal.steering.blockedGoalId) {
			await resolveUltragoalObstacles(cwd, sessionId, goal.steering.blockedGoalId, supersessionEvidence ?? "", now);
		}
		await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
		return completedGoal;
	}

	await assertFailedBlockedAuthorized(cwd, sessionId, plan, goal, status);
	const nextGoal: UltragoalGoal = { ...goal, status, updatedAt: now };
	if (status === "active") nextGoal.startedAt = nextGoal.startedAt ?? now;
	if (input.evidence?.trim()) nextGoal.evidence = input.evidence.trim();
	const nextPlan = replaceGoal({ ...plan, updatedAt: now }, nextGoal);
	const checkpointLedgerEventId = randomUUID();
	await appendLedger(
		cwd,
		{
			eventId: checkpointLedgerEventId,
			event: "goal_checkpointed",
			goalId: goal.id,
			status,
			statusBefore: beforeStatus,
			evidenceSha256: input.evidence ? sha256(input.evidence) : undefined,
		},
		sessionId,
	);
	await writePlan(cwd, nextPlan, sessionId);
	await writeCheckpointSnapshot(cwd, sessionId, nextPlan, nextGoal, checkpointLedgerEventId);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	return nextGoal;
}

export async function restoreUltragoalCheckpoint(
	cwd: string,
	input: { checkpointId?: string; expectedPlanHash?: string },
	sessionId: string,
): Promise<{ plan: UltragoalPlan; checkpoint: UltragoalCheckpointSummary }> {
	const currentPlan = await readUltragoalPlan(cwd, sessionId);
	if (!currentPlan) throw new Error("No ultragoal plan found. Create one first.");
	const latest = await latestCheckpointFromLedger(cwd, sessionId);
	if (!latest) throw new Error("No ultragoal checkpoint snapshot found to restore.");
	if (input.checkpointId && input.checkpointId !== latest.checkpointId) {
		throw new Error("restore-checkpoint only restores the latest checkpoint for this ultragoal run");
	}
	if (input.expectedPlanHash && input.expectedPlanHash !== planHash(currentPlan)) {
		throw new Error(
			"restore-checkpoint expectedPlanHash does not match current plan; refresh status before retrying",
		);
	}
	const read = await readExistingStateForMutation(latest.path);
	if (read.kind === "absent") throw new Error(`ultragoal checkpoint snapshot is missing: ${latest.path}`);
	if (read.kind === "corrupt") throw new Error(`ultragoal checkpoint snapshot is corrupt: ${read.error}`);
	if (!isPlainObject(read.value)) throw new Error("ultragoal checkpoint snapshot is invalid");
	const snapshot = read.value;
	if (snapshot.schemaVersion !== 1) throw new Error("unsupported ultragoal checkpoint snapshot schema");
	if (snapshot.checkpointId !== latest.checkpointId) throw new Error("ultragoal checkpoint snapshot id drift");
	const snapshotPlan = normalizePlan(snapshot.plan);
	if (snapshot.planHash !== planHash(snapshotPlan) || latest.planHash !== planHash(snapshotPlan)) {
		throw new Error("ultragoal checkpoint snapshot hash mismatch");
	}
	const currentIdentity = hashStructuredValue(planIdentity(currentPlan));
	const snapshotIdentity = hashStructuredValue(planIdentity(snapshotPlan));
	if (snapshot.identityHash !== snapshotIdentity || currentIdentity !== snapshotIdentity) {
		throw new Error("restore-checkpoint refused because main goal or task identity changed");
	}
	await appendLedger(cwd, { event: "checkpoint_restored", checkpointId: latest.checkpointId }, sessionId);
	await writePlan(cwd, snapshotPlan, sessionId);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	return { plan: snapshotPlan, checkpoint: latest };
}
