import { randomUUID } from "node:crypto";
import { skillStatePath } from "@tsuuanmi/pi/session/layout";
import { buildUltragoalHud } from "#workflows/skills/ultragoal/hud";
import {
	ultragoalBriefPath,
	ultragoalCheckpointPath,
	ultragoalGoalsPath,
	ultragoalLedgerPath,
} from "#workflows/skills/ultragoal/paths";
import { normalizeGoalStatus, nowIso } from "#workflows/skills/ultragoal/plan-model";
import {
	hashStructuredValue,
	readUltragoalLedger,
	type UltragoalGoal,
	type UltragoalLedgerEvent,
	type UltragoalPlan,
} from "#workflows/skills/ultragoal/receipt";
import type { UltragoalCheckpointSummary, UltragoalStatus } from "#workflows/skills/ultragoal/types";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { appendJsonl, writeJsonAtomic, writeTextArtifact } from "#workflows/state/state-writer";
import { writeWorkflowState } from "#workflows/state/workflow-state";

export async function appendLedger(
	cwd: string,
	event: Record<string, unknown>,
	sessionId: string,
): Promise<Record<string, unknown>> {
	const entry = { eventId: randomUUID(), ...event, timestamp: nowIso() };
	await appendJsonl(ultragoalLedgerPath(cwd, sessionId), entry, { cwd });
	return entry;
}

export async function writePlan(cwd: string, plan: UltragoalPlan, sessionId: string): Promise<void> {
	await writeTextArtifact(ultragoalBriefPath(cwd, sessionId), plan.brief, { cwd });
	await writeJsonAtomic(ultragoalGoalsPath(cwd, sessionId), { ...plan }, { cwd });
}

export function planIdentity(plan: UltragoalPlan): Record<string, unknown> {
	return {
		mainGoal: plan.mainGoal,
		goals: plan.goals.map((goal) => ({ id: goal.id, parentGoalId: goal.parentGoalId, sequence: goal.sequence })),
	};
}

export function planHash(plan: UltragoalPlan): string {
	return hashStructuredValue(plan);
}

export async function latestCheckpointFromLedger(
	cwd: string,
	sessionId: string,
): Promise<UltragoalCheckpointSummary | undefined> {
	let ledger: UltragoalLedgerEvent[];
	try {
		ledger = await readUltragoalLedger(cwd, sessionId);
	} catch {
		return undefined;
	}
	for (const event of ledger.slice().reverse()) {
		if (event.event !== "checkpoint_snapshot_written") continue;
		if (
			typeof event.checkpointId === "string" &&
			typeof event.goalId === "string" &&
			typeof event.status === "string" &&
			typeof event.path === "string" &&
			typeof event.planHash === "string"
		) {
			return {
				checkpointId: event.checkpointId,
				goalId: event.goalId,
				status: normalizeGoalStatus(event.status),
				createdAt: typeof event.timestamp === "string" ? event.timestamp : nowIso(),
				path: event.path,
				planHash: event.planHash,
				restoreWarning: "State-only restore: workspace files are not rolled back.",
			};
		}
	}
	return undefined;
}

export async function writeCheckpointSnapshot(
	cwd: string,
	sessionId: string,
	plan: UltragoalPlan,
	goal: UltragoalGoal,
	checkpointLedgerEventId: string,
): Promise<UltragoalCheckpointSummary> {
	const checkpointId = `${goal.id}-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const path = ultragoalCheckpointPath(cwd, sessionId, checkpointId);
	const snapshot = {
		schemaVersion: 1,
		checkpointId,
		createdAt: nowIso(),
		goalId: goal.id,
		status: goal.status,
		checkpointLedgerEventId,
		plan,
		planHash: planHash(plan),
		identityHash: hashStructuredValue(planIdentity(plan)),
		restoreWarning: "State-only restore: workspace files are not rolled back.",
	};
	await writeJsonAtomic(path, snapshot, { cwd });
	await appendLedger(
		cwd,
		{
			event: "checkpoint_snapshot_written",
			checkpointId,
			goalId: goal.id,
			status: goal.status,
			path,
			planHash: snapshot.planHash,
			identityHash: snapshot.identityHash,
			checkpointLedgerEventId,
		},
		sessionId,
	);
	return {
		checkpointId,
		goalId: goal.id,
		status: goal.status,
		createdAt: snapshot.createdAt,
		path,
		planHash: snapshot.planHash,
		restoreWarning: snapshot.restoreWarning,
	};
}

export async function syncUltragoalState(cwd: string, status: UltragoalStatus, sessionId: string): Promise<void> {
	const state = await writeWorkflowState(
		cwd,
		"ultragoal",
		{
			active: status.status !== "complete" && status.status !== "missing",
			current_phase: status.status,
			main_goal_id: status.mainGoal?.id,
			current_goal_id: status.currentGoal?.id,
			last_checkpoint_id: status.lastCheckpoint?.checkpointId,
			last_checkpoint_path: status.lastCheckpoint?.path,
			plan_hash: status.planHash,
			restore_warning: status.lastCheckpoint?.restoreWarning,
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
			state_path: skillStatePath(cwd, "ultragoal", sessionId),
			hud: buildUltragoalHud(status),
		},
		{ sessionId },
	);
}
