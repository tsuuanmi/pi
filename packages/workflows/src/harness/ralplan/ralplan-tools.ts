import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextRalplanRole,
	type RalplanSelectorVerdict,
} from "../shared/expected-next-role.ts";
import { workflowReceipt } from "../shared/receipts.ts";
import { assertRalplanStage, assertSafePathComponent } from "../shared/state-schema.ts";
import { defaultWorkflowId, readWorkflowState } from "../shared/workflow-state.ts";
import {
	assertAgentThinkingLevel,
	assertRalplanApprovalTarget,
	assertRalplanRole,
} from "../shared/workflow-tool-utils.ts";
import { ralplanRoleForStage, runRalplanAgent } from "./ralplan-agents.ts";
import {
	assertRalplanExplorerGatePassed,
	normalizeRalplanExplorerGate,
	recordRalplanExplorerGateArtifact,
} from "./ralplan-gates.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "./ralplan-runtime.ts";

const ralplanWriteArtifactSchema = Type.Object({
	stage: Type.String({ description: "planner, architect, critic, revision, adr, final, or expert-stage" }),
	stageN: Type.Number({ description: "Positive stage iteration number" }),
	artifact: Type.String({ description: "Artifact markdown or a path to a markdown file" }),
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run or generated id." })),
	plannerSubagentId: Type.Optional(
		Type.String({ description: "Persisted Planner role-agent id for planner/revision stages." }),
	),
	plannerResumable: Type.Optional(Type.Boolean({ description: "Whether the Planner role-agent is known resumable." })),
});

type RalplanWriteArtifactInput = Static<typeof ralplanWriteArtifactSchema>;

const ralplanRecordExplorerGateSchema = Type.Object({
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
	contextMap: Type.Object({
		context_needed: Type.Boolean(),
		summary: Type.Optional(Type.String()),
		evidence: Type.Optional(Type.Array(Type.Record(Type.String(), Type.Unknown()))),
	}),
	recordedBy: Type.Optional(Type.String()),
});
type RalplanRecordExplorerGateInput = Static<typeof ralplanRecordExplorerGateSchema>;

const ralplanRunAgentSchema = Type.Object({
	role: Type.Optional(
		Type.String({ description: "planner, architect, critic, or expert-strategist. Defaults from stage." }),
	),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to the role name." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Override agent profile tools." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this role agent." }))),
	task: Type.String({ description: "Role-agent task prompt." }),
	stage: Type.String({ description: "planner, architect, critic, revision, or expert-stage" }),
	stageN: Type.Number({ description: "Positive stage iteration number" }),
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
	contextArtifacts: Type.Optional(
		Type.Array(Type.String({ description: "Persisted artifact paths/receipts to inspect." })),
	),
	deliberate: Type.Optional(Type.Boolean()),
	plannerSubagentId: Type.Optional(
		Type.String({ description: "Persisted Planner id to resume or route feedback to." }),
	),
	attemptResume: Type.Optional(
		Type.Boolean({ description: "Whether this pass is attempting to resume the persisted Planner." }),
	),
	dryRun: Type.Optional(
		Type.Boolean({ description: "Plan and record the role-agent invocation without spawning Pi." }),
	),
});

type RalplanRunAgentInput = Static<typeof ralplanRunAgentSchema>;

const ralplanRunSchema = Type.Object({
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
});

type RalplanRunInput = Static<typeof ralplanRunSchema>;

const ralplanApproveSchema = Type.Object({
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
	approved: Type.Optional(Type.Boolean({ description: "Defaults to true. Set false to reject the pending plan." })),
	target: Type.Optional(Type.String({ description: "ultragoal, team, or stop. Defaults to ultragoal." })),
	note: Type.Optional(Type.String({ description: "Approval or rejection note." })),
	overrideCriticVerdict: Type.Optional(
		Type.Boolean({
			description:
				"Force approval despite a REJECT critic verdict. Records the override. Use only with explicit human intent.",
		}),
	),
});

type RalplanApproveInput = Static<typeof ralplanApproveSchema>;

async function executeRalplanRecordExplorerGate(params: RalplanRecordExplorerGateInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const result = await recordRalplanExplorerGateArtifact(ctx.cwd, params, ctx.sessionManager.getSessionId());
	return {
		content: [{ type: "text" as const, text: `Recorded ralplan explorer gate ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanRunAgent(params: RalplanRunAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertRalplanStage(params.stage);
	assertRalplanRole(params.role);
	assertAgentThinkingLevel(params.thinkingLevel);
	if (
		params.stage !== "planner" &&
		params.stage !== "architect" &&
		params.stage !== "critic" &&
		params.stage !== "revision" &&
		params.stage !== "expert-stage"
	) {
		throw new Error(`ralplan role agents cannot produce stage: ${params.stage}`);
	}
	if (!Number.isInteger(params.stageN) || params.stageN < 1 || params.stageN > 999) {
		throw new Error(`invalid stageN: ${params.stageN}`);
	}
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const role = params.role ?? ralplanRoleForStage(params.stage);
	const sessionId = ctx.sessionManager.getSessionId();
	const ralplanState = await readWorkflowState(ctx.cwd, "ralplan", { sessionId }).catch(() => undefined);
	const selectorRunId =
		params.runId?.trim() ||
		(typeof ralplanState?.run_id === "string" ? ralplanState.run_id : undefined) ||
		defaultWorkflowId("ralplan");
	const ralplanStatus = await readRalplanStatus(ctx.cwd, sessionId, selectorRunId).catch(() => undefined);
	const explorerGate = normalizeRalplanExplorerGate(ralplanState?.explorer_gate);
	const expected = expectedNextRalplanRole(
		{
			current_phase: ralplanState?.current_phase as string | undefined,
			latest: ralplanStatus?.latest
				? {
						stage: ralplanStatus.latest.stage,
						verdict: ralplanStatus.latest.verdict as RalplanSelectorVerdict | undefined,
					}
				: undefined,
			explorerGate: { status: explorerGate?.status ?? "missing" },
			iterateCount: typeof ralplanState?.iterate_count === "number" ? ralplanState.iterate_count : undefined,
			iterateCap: typeof ralplanState?.iterate_cap === "number" ? ralplanState.iterate_cap : undefined,
			expertEscalation: ralplanState?.expert_escalation === true,
			expertCount: typeof ralplanState?.expert_count === "number" ? ralplanState.expert_count : undefined,
			expertCap: typeof ralplanState?.expert_cap === "number" ? ralplanState.expert_cap : undefined,
		},
		selectorRunId,
	);
	if (expected?.stage === "pre-planner") {
		// Deterministic selector block: the explorer pre-planner gate has not
		// passed. Delegate to the gate enforcer, which writes bounded-retry /
		// human_blocked escalation state and throws a fail-closed error.
		await assertRalplanExplorerGatePassed(ctx.cwd, selectorRunId, sessionId);
		throw new Error(
			"ralplan pre-planner explorer gate has not passed; record a context_map via ralplan_record_explorer_gate first",
		);
	}
	if (!expected) {
		throw new Error(
			"no legal next ralplan role spawn: workflow is closed or awaiting approval; use ralplan_write_artifact/approve instead",
		);
	}
	assertExpectedNextRole(expected, {
		skill: "ralplan",
		stage: params.stage,
		role,
		owner: "ralplan_run_agent",
		runId: params.runId,
	});
	assertNoGuardedSpawnOverrides(params);
	const result = await runRalplanAgent(
		ctx.cwd,
		{
			role,
			agent: params.agent,
			model: params.model,
			thinkingLevel: params.thinkingLevel,
			tools: params.tools,
			excludeTools: params.excludeTools,
			task: params.task,
			stage: params.stage,
			stageN: params.stageN,
			runId: params.runId,
			contextArtifacts: params.contextArtifacts,
			deliberate: params.deliberate,
			plannerSubagentId: params.plannerSubagentId,
			attemptResume: params.attemptResume,
			dryRun: params.dryRun,
			subagentManager: ctx.subagents,
		},
		ctx.sessionManager.getSessionId(),
		signal,
	);
	return {
		content: [
			{
				type: "text" as const,
				text: `${result.role} agent ${result.status} for ralplan ${result.stage} stage ${result.stage_n}`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanWriteArtifact(params: RalplanWriteArtifactInput, ctx: ExtensionContext) {
	assertRalplanStage(params.stage);
	if (!Number.isInteger(params.stageN) || params.stageN < 1 || params.stageN > 999) {
		throw new Error(`invalid stageN: ${params.stageN}`);
	}
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const result = await writeRalplanArtifact(
		ctx.cwd,
		{
			stage: params.stage,
			stageN: params.stageN,
			artifact: params.artifact,
			runId: params.runId,
			plannerSubagentId: params.plannerSubagentId,
			plannerResumable: params.plannerResumable,
		},
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [
			{
				type: "text" as const,
				text: result.deduplicated
					? `Ralplan ${params.stage} stage ${params.stageN} already persisted at ${result.path}`
					: `Persisted ralplan ${params.stage} stage ${params.stageN} at ${result.path}`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanStatus(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const status = await readRalplanStatus(ctx.cwd, ctx.sessionManager.getSessionId(), params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
		details: workflowReceipt({ ...status }),
	};
}

async function executeRalplanReadCompact(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const status = await readRalplanCompactStatus(ctx.cwd, ctx.sessionManager.getSessionId(), params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
		details: workflowReceipt({ ...status }),
	};
}

async function executeRalplanApprove(params: RalplanApproveInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	assertRalplanApprovalTarget(params.target);
	const result = await approveRalplanPlan(ctx.cwd, {
		runId: params.runId,
		approved: params.approved,
		target: params.target,
		note: params.note,
		overrideCriticVerdict: params.overrideCriticVerdict,
		sessionId: ctx.sessionManager.getSessionId(),
	});
	const baseText = result.approved
		? `Approved ralplan ${result.runId} for ${result.target}`
		: `Rejected ralplan ${result.runId}`;
	const { failSoftErrors, ...receiptRest } = result;
	const notes: string[] = [];
	if (result.critic_verdict) notes.push(`critic verdict: ${result.critic_verdict}`);
	if (result.critic_verdict_overridden) notes.push("approved despite REJECT (override)");
	if (result.approval_warning) notes.push(result.approval_warning);
	if (failSoftErrors?.length) notes.push(`fail-soft errors: ${failSoftErrors.length}`);
	const text = notes.length > 0 ? `${baseText} (${notes.join("; ")})` : baseText;
	return {
		content: [
			{
				type: "text" as const,
				text,
			},
		],
		details: workflowReceipt({
			...receiptRest,
			...(failSoftErrors?.length
				? {
						fail_soft_errors: {
							count: failSoftErrors.length,
							recent: failSoftErrors.slice(-3).map((e) => ({ site: e.site, ts: e.ts })),
						},
					}
				: {}),
		}),
	};
}

async function executeRalplanDoctor(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const result = await doctorRalplan(ctx.cwd, ctx.sessionManager.getSessionId(), params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

export function registerRalplanTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ralplan_record_explorer_gate",
		label: "Ralplan Record Explorer Gate",
		description: "Record a validated explorer context_map before the ralplan planner runs.",
		promptSnippet: "Record explorer context map for ralplan pre-planner gate",
		promptGuidelines: [
			"Use ralplan_record_explorer_gate after explorer produces a context_map and before ralplan_run_agent stage=planner.",
		],
		parameters: ralplanRecordExplorerGateSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanRecordExplorerGate(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_run_agent",
		label: "Ralplan Role Agent",
		description:
			"Run an isolated Pi role agent for ralplan Planner, Architect, or Critic and record the invocation under .pi/<session-id>/workflows/ralplan/agents.",
		promptSnippet: "Run ralplan Planner/Architect/Critic role agents",
		promptGuidelines: [
			"Use ralplan_run_agent for Planner, Architect, Critic, and Planner revision passes instead of pretending one model persona reviewed itself inline.",
			"Role agents must persist durable output with ralplan_write_artifact and return receipt-only summaries.",
		],
		parameters: ralplanRunAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeRalplanRunAgent(params, ctx, signal),
	});

	pi.registerTool({
		name: "ralplan_status",
		label: "Ralplan Status",
		description: "Read ralplan run state, index rows, stage summary, and pending approval status.",
		promptSnippet: "Read ralplan run status and persisted artifact index",
		promptGuidelines: ["Use ralplan_status before resuming or auditing a ralplan run."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanStatus(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_read_compact",
		label: "Ralplan Compact Status",
		description: "Read compact ralplan status for prompt-efficient continuation.",
		promptSnippet: "Read compact ralplan status for continuation",
		promptGuidelines: ["Use ralplan_read_compact when continuing ralplan without needing every index row."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_doctor",
		label: "Ralplan Doctor",
		description: "Validate ralplan index/artifact consistency and pending approval evidence.",
		promptSnippet: "Validate ralplan artifact/index consistency",
		promptGuidelines: ["Use ralplan_doctor when a ralplan run appears inconsistent before writing more artifacts."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanDoctor(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_approve_plan",
		label: "Ralplan Approval Gate",
		description: "Approve or reject a pending ralplan final plan and optionally hand off to ultragoal or team.",
		promptSnippet: "Record ralplan pending-plan approval or rejection",
		promptGuidelines: [
			"Use ralplan_approve_plan only after explicit user approval or rejection of the pending final plan.",
		],
		parameters: ralplanApproveSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanApprove(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_write_artifact",
		label: "Ralplan Artifact",
		description:
			"Persist ralplan stage artifacts under .pi/<session-id>/plans/ralplan/<run-id>/ and update workflow state.",
		promptSnippet: "Persist ralplan planner/architect/critic/final artifacts under .pi/<session-id>/plans",
		promptGuidelines: [
			"Use ralplan_write_artifact for ralplan planning artifacts; do not write .pi/<session-id>/plans directly.",
		],
		parameters: ralplanWriteArtifactSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanWriteArtifact(params, ctx),
	});
}
