import { randomUUID } from "node:crypto";
import type { ObstacleRegression, ObstacleStatus } from "#workflows/harness/shared/audit/decision-ledger";
import { projectCompactStateFor } from "#workflows/harness/shared/compaction/compaction";
import {
	ultragoalBriefPath,
	ultragoalGoalsPath,
	ultragoalLedgerPath,
	workflowStatePath,
} from "#workflows/harness/shared/session/session-layout";
import { syncWorkflowActiveState } from "#workflows/harness/shared/state/active-state";
import {
	appendJsonl,
	readExistingStateForMutation,
	readFileOrLiteral,
	sha256,
	writeJsonAtomic,
	writeTextArtifact,
} from "#workflows/harness/shared/state/state-writer";
import { readWorkflowState, writeWorkflowState } from "#workflows/harness/shared/state/workflow-state";
import { buildUltragoalHud } from "#workflows/harness/ultragoal/ultragoal-hud";
import {
	assertUltragoalObstacle,
	buildUltragoalObstacle,
	ULTRAGOAL_OBSTACLE_KINDS,
	writeUltragoalObstacle,
} from "#workflows/harness/ultragoal/ultragoal-obstacles";
import { validateCompletionQualityGate } from "#workflows/harness/ultragoal/ultragoal-quality-gate";
import {
	buildCompletionReceipt,
	chooseReceiptKind,
	readUltragoalLedger,
	type UltragoalCompletionVerification,
	type UltragoalGoal,
	type UltragoalGoalMode,
	type UltragoalGoalStatus,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	type UltragoalReceiptKind,
	validateCompletionReceipt,
} from "#workflows/harness/ultragoal/ultragoal-receipt";

export type {
	UltragoalCompletionVerification,
	UltragoalGoal,
	UltragoalGoalMode,
	UltragoalGoalStatus,
	UltragoalLedgerEvent,
	UltragoalPlan,
	UltragoalReceiptKind,
};

export interface UltragoalStatus {
	exists: boolean;
	status: "missing" | "pending" | "active" | "complete" | "blocked" | "failed";
	currentGoal?: UltragoalGoal;
	counts: Record<UltragoalGoalStatus, number>;
	goals: UltragoalGoal[];
	brief_path: string;
	goals_path: string;
	ledger_path: string;
}

export type UltragoalBlockerClassification = "human_blocked" | "resolvable";

const TERMINAL_STATUSES = new Set<UltragoalGoalStatus>(["complete", "superseded"]);
const SCHEDULABLE_STATUSES = new Set<UltragoalGoalStatus>(["pending", "active", "failed"]);
const GOAL_DELIMITER = /^@goal(?::|[ \t]+|$)[ \t]*(.*)$/;
const BLOCKER_PENDING_STATUSES = new Set<UltragoalGoalStatus>([
	"pending",
	"active",
	"failed",
	"blocked",
	"review_blocked",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
	return new Date().toISOString();
}

function normalizeGoalStatus(value: unknown): UltragoalGoalStatus {
	return value === "pending" ||
		value === "active" ||
		value === "complete" ||
		value === "failed" ||
		value === "blocked" ||
		value === "review_blocked" ||
		value === "superseded"
		? value
		: "pending";
}

function parseGoalStatus(value: string): UltragoalGoalStatus {
	const status = normalizeGoalStatus(value);
	if (status === "pending" && value !== "pending") throw new Error(`invalid ultragoal status: ${value}`);
	return status;
}

function firstNonEmptyLine(text: string): string | undefined {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}

function clampTitle(title: string): string {
	return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function parseGoalsFromBrief(brief: string): Array<{ title: string; objective: string }> {
	const sections: Array<{ title: string; body: string[] }> = [];
	let current: { title: string; body: string[] } | undefined;
	for (const line of brief.split(/\r?\n/)) {
		const match = GOAL_DELIMITER.exec(line);
		if (match) {
			current = { title: match[1].trim(), body: [] };
			sections.push(current);
			continue;
		}
		current?.body.push(line);
	}
	if (sections.length === 0) {
		const title = firstNonEmptyLine(brief) ?? "Complete approved goal";
		return [{ title: clampTitle(title), objective: brief.trim() }];
	}
	return sections.map((section, index) => {
		const body = section.body.join("\n").trim();
		const title = section.title || firstNonEmptyLine(body) || "";
		if (!title && !body) throw new Error(`ultragoal @goal block ${index + 1} has no title or objective`);
		return { title: clampTitle(title), objective: body || title };
	});
}

function normalizeSteering(value: unknown): UltragoalGoal["steering"] | undefined {
	if (!isPlainObject(value)) return undefined;
	const kind = typeof value.kind === "string" ? value.kind : undefined;
	if (!kind) return undefined;
	return { kind, blockedGoalId: typeof value.blockedGoalId === "string" ? value.blockedGoalId : undefined };
}

function normalizePlan(raw: unknown): UltragoalPlan {
	if (!isPlainObject(raw)) throw new Error("Invalid ultragoal plan: expected object");
	const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
	const goals = Array.isArray(raw.goals) ? raw.goals : [];
	return {
		version: 1,
		brief: typeof raw.brief === "string" ? raw.brief : "",
		goalMode: raw.goalMode === "per-story" ? "per-story" : "aggregate",
		objective: typeof raw.objective === "string" ? raw.objective : "Complete all approved goals with verification",
		objectiveAliases: Array.isArray(raw.objectiveAliases)
			? raw.objectiveAliases.filter((alias): alias is string => typeof alias === "string")
			: undefined,
		goals: goals.map((item, index): UltragoalGoal => {
			const record = isPlainObject(item) ? item : {};
			const goalCreatedAt = typeof record.createdAt === "string" ? record.createdAt : createdAt;
			return {
				id: typeof record.id === "string" ? record.id : `G${String(index + 1).padStart(3, "0")}`,
				title: typeof record.title === "string" ? record.title : `Goal ${index + 1}`,
				objective:
					typeof record.objective === "string"
						? record.objective
						: typeof record.title === "string"
							? record.title
							: `Goal ${index + 1}`,
				status: normalizeGoalStatus(record.status),
				createdAt: goalCreatedAt,
				updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : goalCreatedAt,
				startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
				completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
				evidence: typeof record.evidence === "string" ? record.evidence : undefined,
				steering: normalizeSteering(record.steering),
				completionVerification: isPlainObject(record.completionVerification)
					? (record.completionVerification as unknown as UltragoalCompletionVerification)
					: undefined,
			};
		}),
		createdAt,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
	};
}

function emptyCounts(): Record<UltragoalGoalStatus, number> {
	return { pending: 0, active: 0, complete: 0, failed: 0, blocked: 0, review_blocked: 0, superseded: 0 };
}

function requiredGoals(plan: UltragoalPlan): UltragoalGoal[] {
	return plan.goals.filter((goal) => goal.status !== "superseded");
}

function chooseNextGoal(plan: UltragoalPlan, retryFailed: boolean): UltragoalGoal | undefined {
	return (
		plan.goals.find((goal) => goal.status === "active") ??
		plan.goals.find((goal) => goal.status === "pending") ??
		(retryFailed ? plan.goals.find((goal) => goal.status === "failed") : undefined)
	);
}

async function appendLedger(
	cwd: string,
	event: Record<string, unknown>,
	sessionId: string,
): Promise<Record<string, unknown>> {
	const entry = { eventId: randomUUID(), ...event, timestamp: nowIso() };
	await appendJsonl(ultragoalLedgerPath(cwd, sessionId), entry, { cwd });
	return entry;
}

async function writePlan(cwd: string, plan: UltragoalPlan, sessionId: string): Promise<void> {
	await writeTextArtifact(ultragoalBriefPath(cwd, sessionId), plan.brief, { cwd });
	await writeJsonAtomic(ultragoalGoalsPath(cwd, sessionId), { ...plan }, { cwd });
}

async function syncUltragoalState(cwd: string, status: UltragoalStatus, sessionId: string): Promise<void> {
	const state = await writeWorkflowState(
		cwd,
		"ultragoal",
		{
			active: status.status !== "complete" && status.status !== "missing",
			current_phase: status.status,
			current_goal_id: status.currentGoal?.id,
			counts: status.counts,
		},
		"pi workflow state write",
		{ operation: "runtime-sync", sessionId },
	);
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "ultragoal",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "ultragoal", sessionId),
			hud: buildUltragoalHud(status),
		},
		{ sessionId },
	);
}

export async function readUltragoalPlan(cwd: string, sessionId: string): Promise<UltragoalPlan | undefined> {
	const read = await readExistingStateForMutation(ultragoalGoalsPath(cwd, sessionId));
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`ultragoal plan is corrupt: ${read.error}`);
	return normalizePlan(read.value);
}

export { requiredGoals };

export async function createUltragoalPlan(
	cwd: string,
	input: { brief: string; goalMode?: UltragoalGoalMode },
	sessionId: string,
): Promise<UltragoalPlan> {
	const brief = (await readFileOrLiteral(input.brief, cwd)).trim();
	if (!brief) throw new Error("ultragoal brief is required");
	const now = nowIso();
	const plan: UltragoalPlan = {
		version: 1,
		brief,
		goalMode: input.goalMode ?? "aggregate",
		objective: "Complete all approved goals with verification",
		goals: parseGoalsFromBrief(brief).map((goal, index) => ({
			id: `G${String(index + 1).padStart(3, "0")}`,
			title: goal.title,
			objective: goal.objective,
			status: "pending",
			createdAt: now,
			updatedAt: now,
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
		currentGoal,
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

function validateCompletionEvidence(evidence: string): void {
	const trimmed = evidence.trim();
	if (trimmed.length < 32 || trimmed.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length < 5) {
		throw new Error("completion evidence must be substantive");
	}
}

function nonEmpty(value: string | undefined, field: string): string {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error(`${field} is required`);
	return trimmed;
}

function replaceGoal(plan: UltragoalPlan, replacement: UltragoalGoal): UltragoalPlan {
	return { ...plan, goals: plan.goals.map((goal) => (goal.id === replacement.id ? replacement : goal)) };
}

function replaceGoals(plan: UltragoalPlan, replacements: UltragoalGoal[]): UltragoalPlan {
	const byId = new Map(replacements.map((goal) => [goal.id, goal]));
	return { ...plan, goals: plan.goals.map((goal) => byId.get(goal.id) ?? goal) };
}

function activeRecordedBlocker(plan: UltragoalPlan, blockedGoalId: string): UltragoalGoal | undefined {
	return plan.goals.find(
		(goal) =>
			goal.steering?.kind === "review_blocker" &&
			goal.steering.blockedGoalId === blockedGoalId &&
			BLOCKER_PENDING_STATUSES.has(goal.status),
	);
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
		await writePlan(cwd, finalPlan, sessionId);
		await appendLedger(cwd, event, sessionId);
		await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
		return completedGoal;
	}

	await assertFailedBlockedAuthorized(cwd, sessionId, plan, goal, status);
	const nextGoal: UltragoalGoal = { ...goal, status, updatedAt: now };
	if (status === "active") nextGoal.startedAt = nextGoal.startedAt ?? now;
	if (input.evidence?.trim()) nextGoal.evidence = input.evidence.trim();
	const nextPlan = replaceGoal({ ...plan, updatedAt: now }, nextGoal);
	await writePlan(cwd, nextPlan, sessionId);
	await appendLedger(
		cwd,
		{
			event: "goal_checkpointed",
			goalId: goal.id,
			status,
			statusBefore: beforeStatus,
			evidenceSha256: input.evidence ? sha256(input.evidence) : undefined,
		},
		sessionId,
	);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd, sessionId), sessionId);
	return nextGoal;
}

export async function recordUltragoalReviewBlockers(
	cwd: string,
	input: { goalId: string; title: string; objective: string; evidence: string },
	sessionId: string,
): Promise<UltragoalPlan> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const goal = plan.goals.find((item) => item.id === input.goalId);
	if (!goal) throw new Error(`unknown ultragoal goal: ${input.goalId}`);
	if (goal.status !== "active") throw new Error("record-review-blockers target must be the active goal");
	if (activeRecordedBlocker(plan, goal.id)) throw new Error(`review blockers already recorded for ${goal.id}`);
	const title = nonEmpty(input.title, "record-review-blockers title");
	const objective = nonEmpty(input.objective, "record-review-blockers objective");
	const evidence = nonEmpty(input.evidence, "record-review-blockers evidence");
	const now = nowIso();
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
	await appendLedger(cwd, { event: "review_blockers_recorded", goalId: goal.id, blockerGoalId: blockerId }, sessionId);
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

export async function readUltragoalCompact(cwd: string, sessionId: string): Promise<Record<string, unknown>> {
	const status = await getUltragoalStatus(cwd, sessionId);
	const state = await readWorkflowState(cwd, "ultragoal", { sessionId }).catch(() => undefined);
	return projectCompactStateFor<Record<string, unknown>>("ultragoal", {
		status,
		state,
		statePath: workflowStatePath(cwd, "ultragoal", sessionId),
	});
}

/**
 * Record a typed review-blocker obstacle against the active goal (Phase B-0
 * additive dual-write). Runs the integrity wall (`assertUltragoalObstacle`) on
 * the obstacle BEFORE any write, so an invalid obstacle never leaves a legacy
 * review-blocker goal behind. Then performs the unchanged legacy write
 * (`recordUltragoalReviewBlockers`: mark the goal `review_blocked`, append the
 * steering `review_blocker` goal, write the `review_blockers_recorded` ledger
 * event) AND appends the validated obstacle to the per-skill obstacle ledger.
 *
 * The guard and checkpoint path are unchanged and still drive off the legacy
 * model; the obstacle ledger is read only from Phase B-1 onward. Existing
 * behavior and tests are unaffected.
 */
export async function recordUltragoalObstacle(
	cwd: string,
	input: {
		goalId: string;
		kind: string;
		title: string;
		objective: string;
		evidence: string;
		rationale?: string;
		criterion?: string;
		regression?: ObstacleRegression;
		status?: ObstacleStatus;
	},
	sessionId: string,
): Promise<UltragoalPlan> {
	const plan = await readUltragoalPlan(cwd, sessionId);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const goal = plan.goals.find((item) => item.id === input.goalId);
	if (!goal) throw new Error(`unknown ultragoal goal: ${input.goalId}`);
	if (goal.status !== "active") throw new Error("record-obstacle target must be the active goal");
	if (activeRecordedBlocker(plan, goal.id)) throw new Error(`review blockers already recorded for ${goal.id}`);
	if (!(input.kind in ULTRAGOAL_OBSTACLE_KINDS)) throw new Error(`unknown ultragoal obstacle kind: ${input.kind}`);
	const title = nonEmpty(input.title, "record-obstacle title");
	const objective = nonEmpty(input.objective, "record-obstacle objective");
	const evidence = nonEmpty(input.evidence, "record-obstacle evidence");
	const status: ObstacleStatus = input.status ?? "active";
	const now = nowIso();

	// Build + validate the obstacle FIRST (no writes): an invalid obstacle must
	// not produce a legacy review-blocker goal.
	const obstacle = buildUltragoalObstacle(
		{
			kind: input.kind,
			name: ULTRAGOAL_OBSTACLE_KINDS[input.kind]?.label ?? input.kind,
			status,
			scope: { goalId: goal.id, ...(input.criterion ? { criterion: input.criterion } : {}) },
			evidence,
			rationale: input.rationale,
			regression: input.regression,
			originRef: goal.id,
		},
		now,
	);
	assertUltragoalObstacle(obstacle);

	// Legacy dual-write (unchanged path).
	const nextPlan = await recordUltragoalReviewBlockers(
		cwd,
		{ goalId: goal.id, title, objective, evidence },
		sessionId,
	);

	// New path: append the validated obstacle to the per-skill ledger.
	await writeUltragoalObstacle(cwd, sessionId, obstacle);

	return nextPlan;
}
