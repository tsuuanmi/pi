import { randomUUID } from "node:crypto";
import { sessionActiveStatePath, skillStatePath } from "@tsuuanmi/pi/session/layout";
import { requireSessionId } from "@tsuuanmi/pi/session/root";
import type { ObstacleInput, ObstacleTrigger } from "#workflows/audit/decision-ledger";
import {
	beginWorkflowTransactionJournal,
	completeWorkflowTransactionJournal,
	updateWorkflowTransactionJournal,
	type WorkflowTransactionSide,
} from "#workflows/audit/transaction-journal";
import { initialWorkflowPhase } from "#workflows/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";
import { writeRalplanObstacle } from "#workflows/skills/ralplan/obstacles";
import { appendUltragoalObstacle } from "#workflows/skills/ultragoal/obstacles";
import { applyHandoffToActiveState } from "#workflows/state/active-state";
import { assertWorkflowSkill, type WorkflowStateEnvelope } from "#workflows/state/state-schema";
import { readWorkflowState, writeWorkflowState } from "#workflows/state/workflow-state";

export interface HandoffSidePatch {
	skill: WorkflowSkill;
	patch: Record<string, unknown> & { carried_obstacles?: ObstacleInput[] };
}

export interface HandoffWorkflowOptions {
	cwd: string;
	caller: HandoffSidePatch;
	callee: HandoffSidePatch;
	command: string;
	mutationId?: string;
	sessionId: string;
	nowIso?: string;
}

export interface HandoffWorkflowResult {
	mutationId: string;
	callerState: WorkflowStateEnvelope;
	calleeState: WorkflowStateEnvelope;
	carriedObstacleCount: number;
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

async function ingestObstacles(input: {
	cwd: string;
	sessionId: string;
	calleeSkill: WorkflowSkill;
	callerSkill: WorkflowSkill;
	calleePatch: HandoffSidePatch["patch"];
	nowIso: string;
}): Promise<number> {
	const carried = input.calleePatch.carried_obstacles;
	if (!Array.isArray(carried) || carried.length === 0) return 0;
	if (input.calleeSkill !== "ralplan" && input.calleeSkill !== "ultragoal") {
		throw new Error(`handoff target ${input.calleeSkill} cannot accept carried obstacles`);
	}
	const originRef =
		typeof input.calleePatch.handoff_ref === "string"
			? input.calleePatch.handoff_ref
			: typeof input.calleePatch.input === "string"
				? input.calleePatch.input
				: `${input.callerSkill}:handoff`;
	let count = 0;
	for (const obstacle of carried) {
		const trigger = toObstacleTrigger(obstacle, input.callerSkill, originRef, input.nowIso);
		if (input.calleeSkill === "ralplan") {
			const runId = typeof input.calleePatch.run_id === "string" ? input.calleePatch.run_id : undefined;
			if (!runId) throw new Error("ralplan handoff with carried obstacles requires run_id");
			await writeRalplanObstacle(input.cwd, runId, input.sessionId, trigger);
		} else {
			await appendUltragoalObstacle(input.cwd, input.sessionId, trigger);
		}
		count += 1;
	}
	return count;
}

export async function handoffWorkflow(options: HandoffWorkflowOptions): Promise<HandoffWorkflowResult> {
	const cwd = options.cwd;
	const callerSkill = options.caller.skill;
	const calleeSkill = options.callee.skill;
	assertWorkflowSkill(callerSkill);
	assertWorkflowSkill(calleeSkill);
	if (calleeSkill === callerSkill) {
		throw new Error(`handoff target must differ from caller (both are "${callerSkill}")`);
	}

	requireSessionId(options.sessionId);
	const sessionId = options.sessionId;
	const handoffAt = options.nowIso ?? new Date().toISOString();
	const mutationId = options.mutationId ?? `${callerSkill}:handoff:${calleeSkill}:${handoffAt}`;
	const callerExisting = await readWorkflowState(cwd, callerSkill, { sessionId });
	if (!callerExisting || callerExisting.active !== true) {
		throw new Error(
			`handoff caller ${callerSkill} is not active (no active state at ${skillStatePath(cwd, callerSkill, sessionId)})`,
		);
	}
	const calleeExisting = await readWorkflowState(cwd, calleeSkill, { sessionId });
	if (calleeExisting?.active === true && calleeExisting.handoff_from === callerSkill) {
		throw new Error(`handoff callee ${calleeSkill} already holds an active handoff from ${callerSkill}`);
	}

	const calleePath = skillStatePath(cwd, calleeSkill, sessionId);
	const callerPath = skillStatePath(cwd, callerSkill, sessionId);
	const activePath = sessionActiveStatePath(cwd, sessionId);
	const callerSide: WorkflowTransactionSide = { skill: callerSkill, phase: "handoff" };
	const calleeInitial = initialWorkflowPhase(calleeSkill);
	const calleeSide: WorkflowTransactionSide = { skill: calleeSkill, phase: calleeInitial };

	await beginWorkflowTransactionJournal({
		cwd,
		sessionId,
		mutationId,
		caller: callerSide,
		callee: calleeSide,
		paths: [calleePath, callerPath, activePath],
		stepNames: HANDOFF_STEPS,
	});

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
		{ operation: "handoff-receive", mutationId, sessionId },
	);
	const carriedObstacleCount = await ingestObstacles({
		cwd,
		sessionId,
		calleeSkill,
		callerSkill,
		calleePatch: options.callee.patch,
		nowIso: handoffAt,
	});
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[0]);

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
		{ operation: "handoff-send", mutationId, sessionId },
	);
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[1]);

	// Test-only crash-injection seam: STATE-006. Never set in production.
	const crashAfterCaller = process.env.PI_WORKFLOW_HANDOFF_FAIL_AFTER_CALLER;
	if (crashAfterCaller === mutationId) {
		throw new Error(`injected handoff failure after caller write for ${mutationId}`);
	}

	await applyHandoffToActiveState({
		cwd,
		caller: { skill: callerSkill, phase: "handoff", state_path: callerPath },
		callee: { skill: calleeSkill, phase: calleeInitial, state_path: calleePath },
		sessionId,
		nowIso: handoffAt,
	});
	await updateWorkflowTransactionJournal(cwd, sessionId, mutationId, HANDOFF_STEPS[2]);
	await completeWorkflowTransactionJournal(cwd, sessionId, mutationId);

	return { mutationId, callerState, calleeState, carriedObstacleCount };
}
