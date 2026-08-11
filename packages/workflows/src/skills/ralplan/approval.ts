import { readFile } from "node:fs/promises";
import { handoffWorkflow } from "#workflows/handoff/handoff";
import type { WorkflowSkill } from "#workflows/session/paths";
import { workflowStatePath } from "#workflows/session/session-layout";
import { readRalplanStatus } from "#workflows/skills/ralplan/index-store";
import {
	type RalplanObstacleLedger,
	readRalplanObstacleLedger,
	unresolvedRalplanObstacles,
} from "#workflows/skills/ralplan/obstacles";
import type { RalplanApprovalTarget, RalplanApproveResult, RalplanIndexRow } from "#workflows/skills/ralplan/types";
import type { RalplanCriticVerdictKind } from "#workflows/skills/ralplan/verdicts";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { writeWorkflowState } from "#workflows/state/workflow-state";
export function latestCriticPass(
	rows: readonly RalplanIndexRow[],
): { verdict: RalplanCriticVerdictKind; planRef: string } | undefined {
	let verdict: RalplanCriticVerdictKind | undefined;
	let planRef: string | undefined;
	let stageN = -1;
	for (const row of rows) {
		if (row.stage !== "critic" || !row.verdict || row.verdict.role !== "critic") continue;
		if (row.stage_n > stageN) {
			verdict = row.verdict.verdict;
			planRef = row.path;
			stageN = row.stage_n;
		}
	}
	return verdict !== undefined && planRef !== undefined ? { verdict, planRef } : undefined;
}

export function latestCriticVerdict(rows: readonly RalplanIndexRow[]): RalplanCriticVerdictKind | undefined {
	return latestCriticPass(rows)?.verdict;
}

/**
 * Phase R-2 agreement check: does the obstacle ledger reflect the latest critic
 * verdict for the latest critic pass? Scoped to the latest pass's artifact
 * (`scope.planRef`) so stale active obstacles from EARLIER revision passes (R-1
 * never resolves obstacles) do not read as divergence. By construction R-1 writes
 * exactly the right obstacle (or none for APPROVE), so disagreement means a
 * dual-write bug or a corrupt ledger.
 */
export function criticObstacleAgreement(
	pass: { verdict: RalplanCriticVerdictKind; planRef: string },
	ledger: RalplanObstacleLedger,
): { agree: boolean; reason?: string } {
	const obstacles = unresolvedRalplanObstacles(ledger, { scope: { planRef: pass.planRef } });
	if (pass.verdict === "approve") {
		if (obstacles.length > 0)
			return {
				agree: false,
				reason: `latest critic verdict is APPROVE but ${obstacles.length} unresolved obstacle(s) remain for ${pass.planRef}`,
			};
		return { agree: true };
	}
	const expectedKind = pass.verdict === "reject" ? "plan_rejected" : "revision_required";
	if (!obstacles.some((o) => o.kind === expectedKind))
		return {
			agree: false,
			reason: `latest critic verdict is ${pass.verdict.toUpperCase()} but no unresolved ${expectedKind} obstacle recorded for ${pass.planRef}`,
		};
	return { agree: true };
}

export async function approveRalplanPlan(
	cwd: string,
	options: {
		runId?: string;
		target: RalplanApprovalTarget;
		approved: boolean;
		note?: string;
		sessionId: string;
	},
): Promise<RalplanApproveResult> {
	const sessionId = options.sessionId;
	const { target, approved } = options;
	const status = await readRalplanStatus(cwd, sessionId, options.runId);
	if (!status.run_id)
		throw new Error(
			"cannot approve ralplan without a run_id: no artifacts have been persisted yet. Run the planner stage (`ralplan_run_agent` tool / `pi workflow ralplan write-artifact`) first, then run `pi workflow ralplan doctor` if the run still looks inconsistent.",
		);
	if (!status.pending_approval || !status.pending_approval_path) {
		throw new Error("cannot approve ralplan: no pending approval plan is available");
	}
	await readFile(status.pending_approval_path, "utf8");

	const criticPass = latestCriticPass(status.rows);
	const criticVerdict = criticPass?.verdict;
	if (approved && criticVerdict !== "approve") {
		throw new Error("cannot approve ralplan without an APPROVE verdict from the latest critic pass");
	}
	if (criticPass) {
		const ledger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
		const agreement = criticObstacleAgreement(criticPass, ledger);
		if (!agreement.agree) {
			throw new Error(`ralplan critic/obstacle divergence for ${criticPass.planRef}: ${agreement.reason}`);
		}
	}
	const now = new Date().toISOString();
	const sourceLedger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
	const carriedObstacles = unresolvedRalplanObstacles(sourceLedger).map((obstacle) => ({
		...obstacle,
		originSkill: "ralplan",
		originRef: status.run_id,
	}));
	let ralplanState: Record<string, unknown>;
	let targetState: Record<string, unknown> | undefined;
	if (approved && target !== "stop") {
		// Handoff branch: delegate the caller demote + callee promote + active-state
		// apply to `handoffWorkflow` (transaction journal + both-side receipts +
		// callee->caller->active-state write order). The ralplan approval metadata
		// travels in the caller patch; the callee gets the plan input.
		const targetSkill: WorkflowSkill = target;
		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "ralplan",
				patch: {
					run_id: status.run_id,
					pending_approval_path: status.pending_approval_path,
					approved,
					approval_target: target,
					approval_note: options.note,
					approved_at: now,
				},
			},
			callee: {
				skill: targetSkill,
				patch: {
					input: status.pending_approval_path,
					source_workflow: "ralplan",
					source_run_id: status.run_id,
					carried_obstacles: carriedObstacles,
				},
			},
			command: "pi ralplan approve",
			sessionId,
		});
		ralplanState = result.callerState;
		targetState = result.calleeState;
	} else {
		// No handoff target (stop / rejected): just deactivate ralplan.
		ralplanState = await writeWorkflowState(
			cwd,
			"ralplan",
			{
				active: false,
				current_phase: approved ? "approved" : "rejected",
				run_id: status.run_id,
				pending_approval_path: status.pending_approval_path,
				approved,
				approval_target: target,
				approval_note: options.note,
				approved_at: approved ? now : undefined,
				rejected_at: approved ? undefined : now,
			},
			"pi ralplan approve-reject",
			{ sessionId },
		);
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: false,
				phase: ralplanState.current_phase as string | undefined,
				state_path: workflowStatePath(cwd, "ralplan", sessionId),
			},
			{ sessionId },
		);
	}
	return {
		runId: status.run_id,
		approved,
		target,
		pendingApprovalPath: status.pending_approval_path,
		ralplanState,
		targetState,
		...(criticVerdict ? { critic_verdict: criticVerdict } : {}),
	};
}
