import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { workflowReceipt } from "../shared/receipts.ts";
import { maybeRedirectVagueExecution } from "../shared/vagueness-gate.ts";
import { syncWorkflowHudUi } from "../shared/workflow-state-tool.ts";
import { assertAgentThinkingLevel, requireSubagentManager } from "../shared/workflow-tool-utils.ts";
import { ultragoalGuard } from "./ultragoal-guard.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	recordUltragoalBlockerClassification,
	recordUltragoalReviewBlockers,
	startNextUltragoalGoal,
} from "./ultragoal-runtime.ts";

const ultragoalCreatePlanSchema = Type.Object({
	brief: Type.String(),
	goalMode: Type.Optional(Type.String()),
});
type UltragoalCreatePlanInput = Static<typeof ultragoalCreatePlanSchema>;

const artifactRefSchema = Type.Object({
	id: Type.String(),
	kind: Type.String(),
	description: Type.String(),
	path: Type.Optional(Type.String()),
	inlineEvidence: Type.Optional(Type.Unknown()),
	verifiedReceipt: Type.Optional(Type.Unknown()),
	receipt: Type.Optional(Type.Unknown()),
	replayExempt: Type.Optional(Type.Unknown()),
});

const ultragoalCheckpointSchema = Type.Object({
	goalId: Type.String(),
	status: Type.String(),
	evidence: Type.Optional(Type.String()),
	qualityGate: Type.Optional(
		Type.Object(
			{
				architectReview: Type.Object({
					architectureStatus: Type.String(),
					productStatus: Type.String(),
					codeStatus: Type.String(),
					recommendation: Type.String(),
					commands: Type.Array(Type.String()),
					evidence: Type.String(),
					blockers: Type.Array(Type.Unknown()),
				}),
				executorQa: Type.Object({
					status: Type.String(),
					e2eStatus: Type.String(),
					redTeamStatus: Type.String(),
					evidence: Type.String(),
					e2eCommands: Type.Array(Type.String()),
					redTeamCommands: Type.Array(Type.String()),
					artifactRefs: Type.Array(artifactRefSchema),
					surfaceEvidence: Type.Array(Type.Unknown()),
					adversarialCases: Type.Array(Type.Unknown()),
					contractCoverage: Type.Array(Type.Unknown()),
					blockers: Type.Array(Type.Unknown()),
					changedPaths: Type.Optional(Type.Array(Type.String())),
				}),
				iteration: Type.Object({
					status: Type.String(),
					fullRerun: Type.Boolean(),
					rerunCommands: Type.Array(Type.String()),
					evidence: Type.String(),
					blockers: Type.Array(Type.Unknown()),
				}),
			},
			{
				description:
					"Required for status 'complete'. Hard-break full quality gate: architectReview, executorQa, and iteration. Old executorQa+contractCoverage gates are rejected by runtime validation.",
			},
		),
	),
});
type UltragoalCheckpointInput = Static<typeof ultragoalCheckpointSchema>;

const ultragoalRecordReviewBlockersSchema = Type.Object({
	goalId: Type.String(),
	title: Type.String(),
	objective: Type.String(),
	evidence: Type.String(),
});
type UltragoalRecordReviewBlockersInput = Static<typeof ultragoalRecordReviewBlockersSchema>;

const ultragoalClassifyBlockerSchema = Type.Object({
	classification: Type.String(),
	evidence: Type.String(),
	goalId: Type.Optional(Type.String()),
});
type UltragoalClassifyBlockerInput = Static<typeof ultragoalClassifyBlockerSchema>;

const ultragoalGuardSchema = Type.Object({
	goalId: Type.Optional(Type.String({ description: "Goal id to inspect. Defaults to the active goal." })),
	currentObjective: Type.Optional(Type.String({ description: "Current objective text to match against the plan." })),
});
type UltragoalGuardInput = Static<typeof ultragoalGuardSchema>;

const ultragoalStartNextSchema = Type.Object({
	retryFailed: Type.Optional(Type.Boolean()),
});
type UltragoalStartNextInput = Static<typeof ultragoalStartNextSchema>;

const ultragoalSpawnGoalAgentSchema = Type.Object({
	goalId: Type.String({ description: "Goal id to assign to the subagent." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to worker." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type UltragoalSpawnGoalAgentInput = Static<typeof ultragoalSpawnGoalAgentSchema>;

async function executeUltragoalSpawnGoalAgent(
	params: UltragoalSpawnGoalAgentInput,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const status = await getUltragoalStatus(ctx.cwd, ctx.sessionManager.getSessionId());
	const goal = status.goals.find((g) => g.id === params.goalId);
	if (!goal) throw new Error(`ultragoal goal not found: ${params.goalId}`);
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent ?? "worker",
		role: `ultragoal-worker-${goal.id}`,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		prompt: `Achieve goal "${goal.title}": ${goal.objective}`,
		systemPrompt: `You are an ultragoal worker executing goal "${goal.title}" (id: ${goal.id}). Complete the goal and provide checkpoint evidence.`,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: true,
		label: `ultragoal-${goal.id}`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned subagent ${result.record.id} for goal ${goal.id}` }],
		details: workflowReceipt({ goal, subagent: result.record }),
	};
}

async function executeUltragoalCreatePlan(params: UltragoalCreatePlanInput, ctx: ExtensionContext) {
	const vagueness = maybeRedirectVagueExecution("ultragoal", params.brief);
	if (vagueness.redirect) {
		throw new Error(vagueness.message);
	}
	if (params.goalMode !== undefined && params.goalMode !== "aggregate" && params.goalMode !== "per-story") {
		throw new Error(`invalid ultragoal goalMode: ${params.goalMode}`);
	}
	const result = await createUltragoalPlan(
		ctx.cwd,
		{ brief: params.brief, goalMode: params.goalMode },
		ctx.sessionManager.getSessionId(),
	);
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Created ultragoal plan with ${result.goals.length} goals` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalStatus(_params: object, ctx: ExtensionContext) {
	const result = await getUltragoalStatus(ctx.cwd, ctx.sessionManager.getSessionId());
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalReadCompact(_params: object, ctx: ExtensionContext) {
	const result = await readUltragoalCompact(ctx.cwd, ctx.sessionManager.getSessionId());
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt(result),
	};
}

async function executeUltragoalStartNext(params: UltragoalStartNextInput, ctx: ExtensionContext) {
	const result = await startNextUltragoalGoal(ctx.cwd, params.retryFailed ?? false, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [
			{
				type: "text" as const,
				text: result.goal ? `Started ultragoal ${result.goal.id}` : "No runnable ultragoal goal",
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalCheckpoint(params: UltragoalCheckpointInput, ctx: ExtensionContext) {
	const result = await checkpointUltragoalGoal(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Checkpointed ultragoal ${result.id} as ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalGuard(params: UltragoalGuardInput, ctx: ExtensionContext) {
	const result = await ultragoalGuard(ctx.cwd, ctx.sessionManager.getSessionId(), params);
	return {
		content: [{ type: "text" as const, text: `Ultragoal guard: ${result.state} — ${result.message}` }],
		details: result,
	};
}

async function executeUltragoalRecordReviewBlockers(params: UltragoalRecordReviewBlockersInput, ctx: ExtensionContext) {
	const result = await recordUltragoalReviewBlockers(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Recorded review blockers for ultragoal ${params.goalId}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalClassifyBlocker(params: UltragoalClassifyBlockerInput, ctx: ExtensionContext) {
	if (params.classification !== "human_blocked" && params.classification !== "resolvable") {
		throw new Error('classification must be "human_blocked" or "resolvable"');
	}
	const result = await recordUltragoalBlockerClassification(
		ctx.cwd,
		{ classification: params.classification, evidence: params.evidence, goalId: params.goalId },
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [{ type: "text" as const, text: `Classified ultragoal blocker as ${params.classification}` }],
		details: workflowReceipt({ ...result }),
	};
}

export function registerUltragoalTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ultragoal_create_plan",
		label: "Ultragoal Plan Create",
		description: "Create a Pi-native ultragoal plan from an approved brief.",
		promptSnippet: "Create ultragoal goals from approved brief",
		promptGuidelines: ["Use ultragoal_create_plan before autonomous goal execution if no plan exists."],
		parameters: ultragoalCreatePlanSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalCreatePlan(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_status",
		label: "Ultragoal Status",
		description: "Read ultragoal plan status, counts, and current goal.",
		promptSnippet: "Read ultragoal status",
		promptGuidelines: ["Use ultragoal_status before resuming goal-tracked execution."],
		parameters: Type.Object({}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalStatus(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_read_compact",
		label: "Ultragoal Compact State",
		description: "Read compact ultragoal state for continuation.",
		promptSnippet: "Read compact ultragoal state",
		promptGuidelines: ["Use ultragoal_read_compact for prompt-efficient ultragoal continuation."],
		parameters: Type.Object({}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_start_next",
		label: "Ultragoal Start Next",
		description: "Mark the next pending ultragoal goal active.",
		promptSnippet: "Start next ultragoal goal",
		promptGuidelines: ["Use ultragoal_start_next before implementing the next goal."],
		parameters: ultragoalStartNextSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalStartNext(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_checkpoint",
		label: "Ultragoal Checkpoint",
		description:
			"Checkpoint an ultragoal goal; complete checkpoints require substantive evidence and a passed/verified quality gate.",
		promptSnippet: "Checkpoint ultragoal goal with evidence",
		promptGuidelines: [
			"Use ultragoal_checkpoint after each goal status change; complete only with verified evidence.",
		],
		parameters: ultragoalCheckpointSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalCheckpoint(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_record_review_blockers",
		label: "Ultragoal Record Review Blockers",
		description:
			"Record review blockers by marking a goal review_blocked and appending a pending blocker-resolution goal.",
		promptSnippet: "Record ultragoal review blockers",
		promptGuidelines: [
			"Use ultragoal_record_review_blockers when verification/review finds blockers that must become durable follow-up work.",
		],
		parameters: ultragoalRecordReviewBlockersSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
			executeUltragoalRecordReviewBlockers(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_classify_blocker",
		label: "Ultragoal Classify Blocker",
		description:
			"Record a blocker triage classification. Only immediate latest human_blocked authorizes failed/blocked checkpoints.",
		promptSnippet: "Classify ultragoal blocker",
		promptGuidelines: [
			"Use ultragoal_classify_blocker before failed/blocked checkpoints when the blocker is genuinely human-only.",
		],
		parameters: ultragoalClassifyBlockerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalClassifyBlocker(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_guard",
		label: "Ultragoal Guard",
		description:
			"Read ultragoal verification state and report a diagnostic (inactive, unrelated_goal, active_verified_complete, active_missing_receipt, active_stale_receipt, active_missing_final_receipt, active_dirty_quality_gate, active_review_blocked_unrecorded, active_review_blocked_recorded, unreadable_fail_closed). Use before declaring an ultragoal goal complete to confirm the completion receipt is fresh.",
		promptSnippet: "Check ultragoal completion receipt freshness",
		promptGuidelines: [
			"Use ultragoal_guard before treating a stored completion receipt as complete; it reports stale/missing/dirty receipts and fail-closed unreadable state.",
		],
		parameters: ultragoalGuardSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalGuard(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_spawn_goal_agent",
		label: "Ultragoal Spawn Goal Agent",
		description: "Spawn a subagent to achieve an ultragoal goal.",
		promptSnippet: "Spawn agent for ultragoal goal",
		promptGuidelines: [
			"Use ultragoal_spawn_goal_agent to assign an ultragoal goal to an autonomous subagent worker.",
		],
		parameters: ultragoalSpawnGoalAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			executeUltragoalSpawnGoalAgent(params, ctx, signal),
	});
}
