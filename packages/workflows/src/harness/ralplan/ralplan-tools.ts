import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { ralplanRoleForStage, runRalplanAgent } from "#workflows/harness/ralplan/ralplan-agents";
import { normalizeRalplanExplorerGate } from "#workflows/harness/ralplan/ralplan-gates";
import { readRalplanStatus } from "#workflows/harness/ralplan/ralplan-runtime";
import { workflowReceipt } from "#workflows/harness/shared/artifacts/receipts";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextRalplanRole,
	type RalplanSelectorVerdict,
} from "#workflows/harness/shared/orchestration/expected-next-role";
import {
	assertAgentThinkingLevel,
	assertRalplanRole,
} from "#workflows/harness/shared/orchestration/workflow-tool-utils";
import { assertRalplanStage, assertSafePathComponent } from "#workflows/harness/shared/state/state-schema";
import { defaultWorkflowId, readWorkflowState } from "#workflows/harness/shared/state/workflow-state";

const ralplanRunAgentSchema = Type.Object({
	role: Type.Optional(
		Type.String({ description: "explorer, planner, architect, critic, or expert. Defaults from stage." }),
	),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to the role name." })),
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

async function executeRalplanRunAgent(params: RalplanRunAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertRalplanStage(params.stage);
	assertRalplanRole(params.role);
	assertAgentThinkingLevel(params.thinkingLevel);
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

export function registerRalplanTools(pi: ExtensionAPI): void {
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
}
