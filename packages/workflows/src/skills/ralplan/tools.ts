import { parseThinkingLevel } from "@tsuuanmi/pi";
import { type Static, Type } from "typebox";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextRalplanRole,
	type RalplanSelectorVerdict,
} from "#workflows/policy/expected-next-role";
import { ralplanGateArtifactPath } from "#workflows/session/session-layout";
import { type RalplanAgentInput, roleForStage } from "#workflows/skills/ralplan/agent-roles";
import { normalizeRalplanExplorerGate } from "#workflows/skills/ralplan/gates";
import { assertRalplanRole } from "#workflows/skills/ralplan/guards";
import { readRalplanStatus } from "#workflows/skills/ralplan/index-store";
import { buildRalplanOrchestrationSnapshot } from "#workflows/skills/ralplan/orchestration-snapshot";
import { planRalplanAgent, runRalplanStage } from "#workflows/skills/ralplan/orchestrator";
import { assertRalplanStage, assertSafePathComponent } from "#workflows/state/state-schema";
import { defaultWorkflowId, readWorkflowState } from "#workflows/state/workflow-state";
import type { WorkflowContext } from "#workflows/tool/context";
import { workflowToolDetails } from "#workflows/tool/details";
import type { WorkflowToolHost } from "#workflows/tool/host";

const ralplanRunAgentSchema = Type.Object({
	role: Type.Optional(
		Type.String({ description: "explorer, planner, architect, critic, or expert. Defaults from stage." }),
	),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Override agent profile tools." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this role agent." }))),
	task: Type.String({ description: "Role-agent task prompt." }),
	stage: Type.String({ description: "pre-planner, planner, architect, critic, revision, or expert-stage" }),
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

async function executeRalplanRunAgent(params: RalplanRunAgentInput, ctx: WorkflowContext, signal?: AbortSignal) {
	assertRalplanStage(params.stage);
	assertRalplanRole(params.role);
	const thinkingLevel = parseThinkingLevel(params.thinkingLevel);
	if (
		params.stage !== "pre-planner" &&
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
	const stage = params.stage;
	const role = params.role ?? roleForStage(stage);
	const sessionId = ctx.sessionManager.getSessionId();
	const ralplanState = await readWorkflowState(ctx.cwd, "ralplan", { sessionId });
	const selectorRunId =
		params.runId?.trim() ||
		(typeof ralplanState?.run_id === "string" ? ralplanState.run_id : undefined) ||
		defaultWorkflowId("ralplan");
	assertSafePathComponent(selectorRunId, "runId");
	const ralplanStatus = await readRalplanStatus(ctx.cwd, sessionId, selectorRunId);
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
	if (!expected) {
		throw new Error(
			"no legal next ralplan role spawn: workflow is closed or awaiting approval; use `pi workflow ralplan write-artifact`/`approve-plan` instead",
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
	const agentInput = {
		role,
		model: params.model,
		thinkingLevel,
		tools: params.tools,
		excludeTools: params.excludeTools,
		task: params.task,
		stage,
		stageN: params.stageN,
		runId: selectorRunId,
		contextArtifacts: params.contextArtifacts,
		deliberate: params.deliberate,
		plannerSubagentId: params.plannerSubagentId,
		attemptResume: params.attemptResume,
	} satisfies RalplanAgentInput;
	if (params.dryRun === true) {
		const planned = await planRalplanAgent(ctx.cwd, sessionId, agentInput);
		return {
			content: [
				{
					type: "text" as const,
					text: `${planned.role} agent ${planned.status} for ralplan ${planned.stage} stage ${planned.stage_n}`,
				},
			],
			details: workflowToolDetails({ ...planned }),
		};
	}

	const manager = ctx.subagents;
	const result = await runRalplanStage({
		...agentInput,
		cwd: ctx.cwd,
		sessionId,
		manager,
		signal,
		verifyArtifact: () => verifyRalplanArtifact(ctx.cwd, sessionId, selectorRunId, stage, params.stageN),
	});
	return {
		content: [
			{
				type: "text" as const,
				text: `${result.agent.role} agent ${result.agent.status} for ralplan ${result.agent.stage} stage ${result.agent.stage_n}`,
			},
		],
		details: workflowToolDetails({
			...result.agent,
			orchestrator_run_id: result.run.runIdentity.runId,
			orchestrator_task_id: result.task.id,
			orchestrator_receipt_id: result.receipt.receiptId,
		}),
	};
}

async function verifyRalplanArtifact(
	cwd: string,
	sessionId: string,
	runId: string,
	stage: RalplanAgentInput["stage"],
	stageN: number,
): Promise<boolean> {
	const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId });
	if (stage === "pre-planner") {
		const gate = snapshot.explorerGate;
		return (
			gate?.status === "passed" &&
			"artifact_path" in gate &&
			gate.artifact_path === ralplanGateArtifactPath(cwd, runId, "explorer", gate.attempt, sessionId)
		);
	}
	const artifact = snapshot.index.rows.find((row) => row.stage === stage && row.stage_n === stageN);
	return (
		artifact !== undefined &&
		snapshot.artifactHealth.health === "complete" &&
		snapshot.provenanceHealth.health === "complete" &&
		snapshot.transactionJournal.health === "complete"
	);
}

export function registerRalplanTools(host: WorkflowToolHost): void {
	host.registerTool({
		name: "ralplan_run_agent",
		label: "Ralplan Role Agent",
		description:
			"Run one guarded Ralplan role agent for Explorer, Planner, Architect, Critic, Revision, or Expert and record the invocation under .pi/<session-id>/workflows/ralplan/agents.",
		promptSnippet: "Run one guarded Ralplan role agent",
		promptGuidelines: [
			"Use ralplan_run_agent for Explorer, Planner, Architect, Critic, Revision, and Expert passes instead of pretending one model persona reviewed itself inline.",
			"Role agents must persist durable output with ralplan_write_artifact and return receipt-only summaries.",
		],
		parameters: ralplanRunAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeRalplanRunAgent(params, ctx, signal),
	});
}
