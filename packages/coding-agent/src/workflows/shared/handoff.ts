import { applyHandoffToActiveState } from "./active-state.ts";
import type { WorkflowSkill } from "./paths.ts";
import { workflowActiveStatePath, workflowStatePath } from "./session-layout.ts";
import { assertWorkflowSkill, type WorkflowStateEnvelope } from "./state-schema.ts";
import {
	beginWorkflowTransactionJournal,
	completeWorkflowTransactionJournal,
	updateWorkflowTransactionJournal,
	type WorkflowTransactionSide,
} from "./transaction-journal.ts";
import { initialWorkflowPhase } from "./workflow-manifest.ts";
import { readWorkflowState, writeWorkflowState } from "./workflow-state.ts";

/**
 * Generic, transaction-backed workflow handoff.
 *
 * Orchestrates a caller→callee handoff with Gajae-faithful durability: a
 * per-mutation journal under `.pi/state/transactions/<id>.json`, both-side
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
	/** Skill-specific envelope fields (input, run_id, spec_slug, ...). */
	patch: Record<string, unknown>;
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
	/** Session id for session-scoped path resolution. Omit to use legacy global state. */
	sessionId?: string;
	nowIso?: string;
}

export interface HandoffWorkflowResult {
	mutationId: string;
	callerState: WorkflowStateEnvelope;
	calleeState: WorkflowStateEnvelope;
}

const HANDOFF_STEPS = ["callee-mode-state", "caller-mode-state", "active-state"] as const;

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
	const sessionId = options.sessionId ?? callerSessionId ?? calleeSessionId;
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
	await updateWorkflowTransactionJournal(cwd, mutationId, HANDOFF_STEPS[0]);

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
	await updateWorkflowTransactionJournal(cwd, mutationId, HANDOFF_STEPS[1]);

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
	await updateWorkflowTransactionJournal(cwd, mutationId, HANDOFF_STEPS[2]);

	await completeWorkflowTransactionJournal(cwd, mutationId);

	return {
		mutationId,
		callerState,
		calleeState,
	};
}
