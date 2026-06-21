import crypto from "node:crypto";
import { syncWorkflowActiveState, type WorkflowHudSummary } from "./active-state.ts";
import { ultragoalBriefPath, ultragoalGoalsPath, ultragoalLedgerPath, workflowStatePath } from "./paths.ts";
import {
	appendJsonl,
	readExistingStateForMutation,
	readFileOrLiteral,
	sha256,
	writeJsonAtomic,
	writeTextArtifact,
} from "./state-writer.ts";
import { readWorkflowState, writeWorkflowState } from "./workflow-state.ts";

export type UltragoalGoalStatus =
	| "pending"
	| "active"
	| "complete"
	| "failed"
	| "blocked"
	| "review_blocked"
	| "superseded";
export type UltragoalGoalMode = "aggregate" | "per-story";

export interface UltragoalGoal {
	id: string;
	title: string;
	objective: string;
	status: UltragoalGoalStatus;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	evidence?: string;
	completionVerification?: Record<string, unknown>;
}

export interface UltragoalPlan {
	version: 1;
	brief: string;
	goalMode: UltragoalGoalMode;
	objective: string;
	goals: UltragoalGoal[];
	createdAt: string;
	updatedAt: string;
}

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

const TERMINAL_STATUSES = new Set<UltragoalGoalStatus>(["complete", "superseded"]);
const SCHEDULABLE_STATUSES = new Set<UltragoalGoalStatus>(["pending", "active", "failed"]);
const GOAL_DELIMITER = /^@goal(?::|[ \t]+|$)[ \t]*(.*)$/;

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

function normalizePlan(raw: unknown): UltragoalPlan {
	if (!isPlainObject(raw)) throw new Error("Invalid ultragoal plan: expected object");
	const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
	const goals = Array.isArray(raw.goals) ? raw.goals : [];
	return {
		version: 1,
		brief: typeof raw.brief === "string" ? raw.brief : "",
		goalMode: raw.goalMode === "per-story" ? "per-story" : "aggregate",
		objective: typeof raw.objective === "string" ? raw.objective : "Complete all approved goals with verification",
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
				completionVerification: isPlainObject(record.completionVerification)
					? record.completionVerification
					: undefined,
			};
		}),
		createdAt,
		updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
	};
}

function remainingGoalCount(status: UltragoalStatus): number {
	return (
		status.counts.pending +
		status.counts.active +
		status.counts.failed +
		status.counts.blocked +
		status.counts.review_blocked
	);
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

async function appendLedger(cwd: string, event: Record<string, unknown>): Promise<Record<string, unknown>> {
	const entry = { eventId: crypto.randomUUID(), ...event, timestamp: nowIso() };
	await appendJsonl(ultragoalLedgerPath(cwd), entry, { cwd });
	return entry;
}

async function writePlan(cwd: string, plan: UltragoalPlan): Promise<void> {
	await writeTextArtifact(ultragoalBriefPath(cwd), plan.brief, { cwd });
	await writeJsonAtomic(ultragoalGoalsPath(cwd), { ...plan }, { cwd });
}

async function syncUltragoalState(cwd: string, status: UltragoalStatus, sessionId?: string): Promise<void> {
	const state = await writeWorkflowState(cwd, "ultragoal", {
		active: status.status !== "complete" && status.status !== "missing",
		current_phase: status.status,
		current_goal_id: status.currentGoal?.id,
		counts: status.counts,
	});
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "ultragoal",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "ultragoal"),
			hud: buildUltragoalHud(status),
		},
		sessionId ? { sessionId } : undefined,
	);
}

function buildUltragoalHud(status: UltragoalStatus): WorkflowHudSummary {
	return {
		version: 1,
		summary: status.currentGoal ? `${status.currentGoal.id}: ${status.currentGoal.title}` : status.status,
		chips: [
			{
				label: "status",
				value: status.status,
				priority: 10,
				severity:
					status.status === "blocked" || status.status === "failed"
						? "warning"
						: status.status === "complete"
							? "success"
							: undefined,
			},
			{ label: "done", value: String(status.counts.complete), priority: 20 },
			// "pending" = remaining (non-terminal) goals, not raw counts.pending.
			// Without this, starting a goal (pending -> active) would drop the
			// pending chip before done increments, making the HUD look stale.
			{ label: "pending", value: String(remainingGoalCount(status)), priority: 30 },
			...(status.currentGoal ? [{ label: "goal", value: status.currentGoal.id, priority: 5 }] : []),
		],
		updated_at: nowIso(),
	};
}

async function readUltragoalPlan(cwd: string): Promise<UltragoalPlan | undefined> {
	const read = await readExistingStateForMutation(ultragoalGoalsPath(cwd));
	if (read.kind === "absent") return undefined;
	if (read.kind === "corrupt") throw new Error(`ultragoal plan is corrupt: ${read.error}`);
	return normalizePlan(read.value);
}

export async function createUltragoalPlan(
	cwd: string,
	input: { brief: string; goalMode?: UltragoalGoalMode },
	sessionId?: string,
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
	await writePlan(cwd, plan);
	await appendLedger(cwd, { event: "plan_created", goalIds: plan.goals.map((goal) => goal.id) });
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd), sessionId);
	return plan;
}

export async function getUltragoalStatus(cwd: string): Promise<UltragoalStatus> {
	const plan = await readUltragoalPlan(cwd);
	const counts = emptyCounts();
	if (!plan)
		return {
			exists: false,
			status: "missing",
			counts,
			goals: [],
			brief_path: ultragoalBriefPath(cwd),
			goals_path: ultragoalGoalsPath(cwd),
			ledger_path: ultragoalLedgerPath(cwd),
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
		brief_path: ultragoalBriefPath(cwd),
		goals_path: ultragoalGoalsPath(cwd),
		ledger_path: ultragoalLedgerPath(cwd),
	};
}

export async function startNextUltragoalGoal(
	cwd: string,
	retryFailed = false,
	sessionId?: string,
): Promise<{ plan: UltragoalPlan; goal?: UltragoalGoal; allComplete: boolean }> {
	const plan = await readUltragoalPlan(cwd);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const goal = chooseNextGoal(plan, retryFailed);
	if (!goal) return { plan, allComplete: requiredGoals(plan).every((item) => TERMINAL_STATUSES.has(item.status)) };
	if (goal.status !== "active") {
		const now = nowIso();
		goal.status = "active";
		goal.startedAt = goal.startedAt ?? now;
		goal.updatedAt = now;
		plan.updatedAt = now;
		await writePlan(cwd, plan);
		await appendLedger(cwd, { event: "goal_started", goalId: goal.id });
		await syncUltragoalState(cwd, await getUltragoalStatus(cwd), sessionId);
	}
	return { plan, goal, allComplete: false };
}

function validateCompletionEvidence(evidence: string, qualityGate: unknown): void {
	const trimmed = evidence.trim();
	if (trimmed.length < 32 || trimmed.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word)).length < 5) {
		throw new Error("completion evidence must be substantive");
	}
	if (!isPlainObject(qualityGate)) throw new Error("qualityGate must be an object for complete checkpoints");
	if (qualityGate.status !== "passed" && qualityGate.status !== "verified" && qualityGate.status !== "covered") {
		throw new Error("qualityGate status must be passed, verified, or covered for complete checkpoints");
	}
}

export async function checkpointUltragoalGoal(
	cwd: string,
	input: { goalId: string; status: string; evidence?: string; qualityGate?: unknown },
	sessionId?: string,
): Promise<UltragoalGoal> {
	const plan = await readUltragoalPlan(cwd);
	if (!plan) throw new Error("No ultragoal plan found. Create one first.");
	const status = parseGoalStatus(input.status);
	const goal = plan.goals.find((item) => item.id === input.goalId);
	if (!goal) throw new Error(`unknown ultragoal goal: ${input.goalId}`);
	const beforeStatus = goal.status;
	if (status === "complete") validateCompletionEvidence(input.evidence ?? "", input.qualityGate);
	const now = nowIso();
	const event = await appendLedger(cwd, {
		event: "goal_checkpointed",
		goalId: goal.id,
		status,
		statusBefore: beforeStatus,
		evidenceSha256: input.evidence ? sha256(input.evidence) : undefined,
	});
	goal.status = status;
	goal.updatedAt = now;
	if (status === "active") goal.startedAt = goal.startedAt ?? now;
	if (status === "complete") {
		goal.completedAt = now;
		goal.evidence = input.evidence?.trim();
		goal.completionVerification = {
			schemaVersion: 1,
			receiptId: crypto.randomUUID(),
			verifiedAt: now,
			goalId: goal.id,
			goalStatusBeforeCheckpoint: beforeStatus,
			qualityGateHash: sha256(JSON.stringify(input.qualityGate)),
			planHashBeforeCheckpoint: sha256(JSON.stringify(plan)),
			checkpointLedgerEventId: event.eventId,
		};
	}
	plan.updatedAt = now;
	await writePlan(cwd, plan);
	await syncUltragoalState(cwd, await getUltragoalStatus(cwd), sessionId);
	return goal;
}

export async function readUltragoalCompact(cwd: string): Promise<Record<string, unknown>> {
	const status = await getUltragoalStatus(cwd);
	const state = await readWorkflowState(cwd, "ultragoal").catch(() => undefined);
	return {
		state_path: workflowStatePath(cwd, "ultragoal"),
		phase: state?.current_phase,
		status: status.status,
		counts: status.counts,
		current_goal: status.currentGoal
			? {
					id: status.currentGoal.id,
					title: status.currentGoal.title,
					objective: status.currentGoal.objective,
					status: status.currentGoal.status,
				}
			: undefined,
		goals: status.goals.map((goal) => ({ id: goal.id, title: goal.title, status: goal.status })),
	};
}
