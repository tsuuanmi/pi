import { randomUUID } from "node:crypto";
import { type FailSoftError, recordFailSoftError } from "#workflows/harness/shared/audit/audit-log";
import type { ObstacleInput, ObstacleTrigger } from "#workflows/harness/shared/audit/decision-ledger";
import {
	beginWorkflowTransactionJournal,
	completeWorkflowTransactionJournal,
	updateWorkflowTransactionJournal,
	type WorkflowTransactionSide,
} from "#workflows/harness/shared/audit/transaction-journal";
import { initialWorkflowPhase } from "#workflows/harness/shared/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/harness/shared/session/paths";
import { workflowActiveStatePath, workflowStatePath } from "#workflows/harness/shared/session/session-layout";
import { applyHandoffToActiveState } from "#workflows/harness/shared/state/active-state";
import { assertWorkflowSkill, type WorkflowStateEnvelope } from "#workflows/harness/shared/state/state-schema";
import { readWorkflowState, writeWorkflowState } from "#workflows/harness/shared/state/workflow-state";
import { assertRalplanObstacle, writeRalplanObstacle } from "#workflows/skills/ralplan/ralplan-obstacles";
import { assertUltragoalObstacle, writeUltragoalObstacle } from "#workflows/skills/ultragoal/ultragoal-obstacles";

/**
 * Generic, transaction-backed workflow handoff.
 *
 * Orchestrates a caller→callee handoff with Gajae-faithful durability: a
 * per-mutation journal under `.pi/{session}/state/transactions/<id>.json`, both-side
 * mode-state receipts sharing one `mutationId`, and the write order
 * callee → caller → active-state. The existing `applyHandoffToActiveState`
 * (with its `handoff-receive` active-state operation) is preserved for HUD
 * continuity, layered on top of the new both-side mode-state receipts.
 *
 * Internal-only: no public tool/CLI verb invokes this. The two production
 * handoff sites (`executeDeepInterviewWriteSpec`, `approveRalplanPlan`) are
 * refactored to call it.
 *
 * Crash-injection contract: when
 * `PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER=<mutationId>` is set, the handoff
 * throws after the caller mode-state write and before the active-state apply,
 * leaving a `status:"pending"` journal with `callee-mode-state` + `caller-mode-state`
 * done and `active-state` pending. Orphan detection/repair is deferred to
 * STATE-007.
 */

export interface HandoffSidePatch {
	skill: WorkflowSkill;
	/** Skill-specific envelope fields (input, run_id, spec_slug, carried_obstacles, ...). */
	patch: Record<string, unknown> & {
		carried_obstacles?: ObstacleInput[];
	};
	sessionId?: string;
}

export interface HandoffWorkflowOptions {
	cwd: string;
	caller: HandoffSidePatch;
	callee: HandoffSidePatch;
	command: string;
	/** Shared mutation id (receipts + journal + audit). Defaults to a timestamped id. */
	mutationId?: string;
	/** Internal force flag (bypasses tamper hard-block). No public surface. */
	force?: boolean;
	/** Session id for session-scoped path resolution. */
	sessionId: string;
	nowIso?: string;
}

export interface HandoffWorkflowResult {
	mutationId: string;
	callerState: WorkflowStateEnvelope;
	calleeState: WorkflowStateEnvelope;
	carriedObstacleFailures: FailSoftError[];
}

const HANDOFF_STEPS = ["callee-mode-state", "caller-mode-state", "active-state"] as const;

function toObstacleTrigger(
	input: ObstacleInput,
	originSkill: WorkflowSkill,
	originRef: string,
	now: string,
): ObstacleTrigger {
	const candidate = input as Partial<ObstacleTrigger>;
	return {
		...input,
		id: typeof candidate.id === "string" ? candidate.id : randomUUID(),
		name: typeof candidate.name === "string" ? candidate.name : input.kind,
		originSkill: typeof candidate.originSkill === "string" ? candidate.originSkill : originSkill,
		originRef: typeof candidate.originRef === "string" ? candidate.originRef : originRef,
		createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
	};
}

async function ingestCarriedObstacles(input: {
	cwd: string;
	sessionId: string;
	calleeSkill: WorkflowSkill;
	callerSkill: WorkflowSkill;
	calleeState: WorkflowStateEnvelope;
	calleePatch: HandoffSidePatch["patch"];
	nowIso: string;
}): Promise<FailSoftError[]> {
	const carried = input.calleePatch.carried_obstacles;
	if (!Array.isArray(carried) || carried.length === 0) return [];
	// No ingest handler for this callee skill: record once (not per-obstacle) and
	// return, so a handoff carrying N obstacles to a skill with no handler (e.g.
	// team) produces one fail-soft row instead of N.
	if (input.calleeSkill !== "ralplan" && input.calleeSkill !== "ultragoal") {
		const msg = `no ingest handler for callee skill ${input.calleeSkill}`;
		console.warn(`handoff carried obstacle ingest skipped (fail-soft): ${msg}`);
		return [
			await recordFailSoftError(
				input.cwd,
				input.sessionId,
				{ site: "handoff-no-ingest-handler", message: msg, skill: input.calleeSkill },
				input.nowIso,
			),
		];
	}
	const originRef =
		typeof input.calleePatch.handoff_ref === "string"
			? input.calleePatch.handoff_ref
			: typeof input.calleePatch.input === "string"
				? input.calleePatch.input
				: `${input.callerSkill}:handoff`;
	const failures: FailSoftError[] = [];
	for (const obstacle of carried) {
		try {
			const trigger = toObstacleTrigger(obstacle, input.callerSkill, originRef, input.nowIso);
			if (input.calleeSkill === "ralplan") {
				assertRalplanObstacle(trigger);
				const runId =
					typeof input.calleeState.run_id === "string"
						? input.calleeState.run_id
						: typeof input.calleePatch.run_id === "string"
							? input.calleePatch.run_id
							: undefined;
				if (runId) await writeRalplanObstacle(input.cwd, runId, input.sessionId, trigger);
			} else if (input.calleeSkill === "ultragoal") {
				assertUltragoalObstacle(trigger);
				await writeUltragoalObstacle(input.cwd, input.sessionId, trigger);
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.warn(`handoff carried obstacle ingest failed (fail-soft): ${msg}`);
			failures.push(
				await recordFailSoftError(
					input.cwd,
					input.sessionId,
					{ site: "handoff-carried-obstacle", message: msg, skill: input.calleeSkill },
					input.nowIso,
				),
			);
		}
	}
	return failures;
}

/**
 * Execute a transaction-backed caller→callee handoff.
 *
 * @throws when the caller is not active, the callee equals the caller, either
 *   mode-state is corrupt, the callee already holds an active handoff from
 *   this caller, or a tampered mode-state is encountered unforced.
 */
export async function handoffWorkflow(options: HandoffWorkflowOptions): Promise<HandoffWorkflowResult> {
	const cwd = options.cwd;
	const callerSkill = options.caller.skill;
	const calleeSkill = options.callee.skill;
	assertWorkflowSkill(callerSkill);
	assertWorkflowSkill(calleeSkill);
	if (calleeSkill === callerSkill) {
		throw new Error(`handoff target must differ from caller (both are "${callerSkill}")`);
	}

	// Intra-session enforcement: mismatched session ids throw, one present uses
	// for both. sessionId is always required at the HandoffWorkflowOptions level.
	const callerSessionId = options.caller.sessionId?.trim() || undefined;
	const calleeSessionId = options.callee.sessionId?.trim() || undefined;
	if (callerSessionId && calleeSessionId && callerSessionId !== calleeSessionId) {
		throw new Error(
			`handoff session mismatch: caller has session ${callerSessionId} but callee has session ${calleeSessionId}`,
		);
	}
	// sessionId is required in HandoffWorkflowOptions, but also accept it from caller/callee
	// for backward compatibility with callers that pass it per-side.
	const sessionId = options.sessionId;
	void callerSessionId;
	void calleeSessionId;
	const handoffAt = options.nowIso ?? new Date().toISOString();
	const mutationId = options.mutationId ?? `${callerSkill}:handoff:${calleeSkill}:${handoffAt}`;
	const force = options.force ?? false;

	// Validation: caller must be the active workflow; callee must not already
	// hold an active handoff from this caller.
	const callerExisting = await readWorkflowState(cwd, callerSkill, { sessionId });
	if (!callerExisting || callerExisting.active !== true) {
		throw new Error(
			`handoff caller ${callerSkill} is not active (no active mode-state at ${workflowStatePath(cwd, callerSkill, sessionId)})`,
		);
	}
	const calleeExisting = await readWorkflowState(cwd, calleeSkill, { sessionId }).catch(() => undefined);
	if (
		calleeExisting &&
		calleeExisting.active === true &&
		typeof calleeExisting.handoff_from === "string" &&
		calleeExisting.handoff_from === callerSkill
	) {
		throw new Error(`handoff callee ${calleeSkill} already holds an active handoff from ${callerSkill}`);
	}

	const calleePath = workflowStatePath(cwd, calleeSkill, sessionId);
	const callerPath = workflowStatePath(cwd, callerSkill, sessionId);
	const activeStatePath = workflowActiveStatePath(cwd, sessionId);

	const callerSide: WorkflowTransactionSide = {
		skill: callerSkill,
		sessionId,
		phase: "handoff",
	};
	const calleeInitial = initialWorkflowPhase(calleeSkill);
	const calleeSide: WorkflowTransactionSide = {
		skill: calleeSkill,
		sessionId,
		phase: calleeInitial,
	};

	await beginWorkflowTransactionJournal({
		cwd,
		mutationId,
		caller: callerSide,
		callee: calleeSide,
		paths: [calleePath, callerPath, activeStatePath],
		stepNames: HANDOFF_STEPS,
	});

	// 1. Write callee mode-state (promote).
	const calleeState = await writeWorkflowState(
		cwd,
		calleeSkill,
		{
			...options.callee.patch,
			active: true,
			current_phase: calleeInitial,
			handoff_from: callerSkill,
			handoff_at: handoffAt,
		},
		options.command,
		{ operation: "handoff-receive", force, mutationId, sessionId },
	);
	const carriedObstacleFailures = await ingestCarriedObstacles({
		cwd,
		sessionId,
		calleeSkill,
		callerSkill,
		calleeState,
		calleePatch: options.callee.patch,
		nowIso: handoffAt,
	});
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[0]);

	// 2. Write caller mode-state (demote).
	const callerState = await writeWorkflowState(
		cwd,
		callerSkill,
		{
			...options.caller.patch,
			active: false,
			current_phase: "handoff",
			handoff_to: calleeSkill,
			handoff_at: handoffAt,
		},
		options.command,
		{ operation: "handoff-send", force, mutationId, sessionId },
	);
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[1]);

	// 3. Crash-injection
	if (process.env.PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER === mutationId) {
		throw new Error(`injected handoff failure after caller write for ${mutationId}`);
	}

	// 4. Apply the active-state handoff
	await applyHandoffToActiveState({
		cwd,
		caller: {
			skill: callerSkill,
			phase: "handoff",
			state_path: callerPath,
		},
		callee: {
			skill: calleeSkill,
			phase: calleeInitial,
			state_path: calleePath,
		},
		sessionId,
		nowIso: handoffAt,
	});
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[2]);

	await completeWorkflowTransactionJournal(cwd, sessionId, mutationId);

	return {
		mutationId,
		callerState,
		calleeState,
		carriedObstacleFailures,
	};
}
