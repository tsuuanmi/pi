import { type Static, Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../../../../api/types.ts";
import { workflowReceipt } from "../shared/receipts.ts";
import { assertRalplanStage, assertSafePathComponent } from "../shared/state-schema.ts";
import {
	assertAgentThinkingLevel,
	assertRalplanApprovalTarget,
	assertRalplanRole,
} from "../shared/workflow-tool-utils.ts";
import { ralplanRoleForStage, runRalplanAgent } from "./ralplan-agents.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "./ralplan-runtime.ts";

const ralplanWriteArtifactSchema = Type.Object({
	stage: Type.String({ description: "planner, architect, critic, revision, adr, or final" }),
	stageN: Type.Number({ description: "Positive stage iteration number" }),
	artifact: Type.String({ description: "Artifact markdown or a path to a markdown file" }),
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run or generated id." })),
	plannerSubagentId: Type.Optional(
		Type.String({ description: "Persisted Planner role-agent id for planner/revision stages." }),
	),
	plannerResumable: Type.Optional(Type.Boolean({ description: "Whether the Planner role-agent is known resumable." })),
});

type RalplanWriteArtifactInput = Static<typeof ralplanWriteArtifactSchema>;

const ralplanRunAgentSchema = Type.Object({
	role: Type.Optional(Type.String({ description: "planner, architect, or critic. Defaults from stage." })),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to the role name." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Override agent profile tools." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this role agent." }))),
	task: Type.String({ description: "Role-agent task prompt." }),
	stage: Type.String({ description: "planner, architect, critic, or revision" }),
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
});

type RalplanApproveInput = Static<typeof ralplanApproveSchema>;

async function executeRalplanRunAgent(params: RalplanRunAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertRalplanStage(params.stage);
	assertRalplanRole(params.role);
	assertAgentThinkingLevel(params.thinkingLevel);
	if (
		params.stage !== "planner" &&
		params.stage !== "architect" &&
		params.stage !== "critic" &&
		params.stage !== "revision"
	) {
		throw new Error(`ralplan role agents cannot produce stage: ${params.stage}`);
	}
	if (!Number.isInteger(params.stageN) || params.stageN < 1 || params.stageN > 999) {
		throw new Error(`invalid stageN: ${params.stageN}`);
	}
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const role = params.role ?? ralplanRoleForStage(params.stage);
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
		sessionId: ctx.sessionManager.getSessionId(),
	});
	return {
		content: [
			{
				type: "text" as const,
				text: result.approved
					? `Approved ralplan ${result.runId} for ${result.target}`
					: `Rejected ralplan ${result.runId}`,
			},
		],
		details: workflowReceipt({ ...result }),
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
		name: "ralplan_run_agent",
		label: "Ralplan Role Agent",
		description:
			"Run an isolated Pi role agent for ralplan Planner, Architect, or Critic and record the invocation under .pi/workflows/ralplan/agents.",
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
		description: "Persist ralplan stage artifacts under .pi/plans/ralplan/<run-id>/ and update workflow state.",
		promptSnippet: "Persist ralplan planner/architect/critic/final artifacts under .pi/plans",
		promptGuidelines: ["Use ralplan_write_artifact for ralplan planning artifacts; do not write .pi/plans directly."],
		parameters: ralplanWriteArtifactSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanWriteArtifact(params, ctx),
	});
}
