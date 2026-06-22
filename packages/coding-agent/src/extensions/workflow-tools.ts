import { type Static, Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../api/types.ts";
import { renderSubagentProgress } from "../core/subagent-progress.ts";
import { deriveDeepInterviewHud } from "../workflows/deep-interview/deep-interview-hud.ts";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
} from "../workflows/deep-interview/deep-interview-runtime.ts";
import {
	type DeepInterviewTriggerMetadata,
	projectCompactState,
} from "../workflows/deep-interview/deep-interview-state.ts";
import { createFetchToolDefinition } from "../workflows/harness-tools/fetch.ts";
import { createGithubToolDefinition } from "../workflows/harness-tools/github.ts";
import { createReportFindingToolDefinition } from "../workflows/harness-tools/report-finding.ts";
import { createYieldToolDefinition } from "../workflows/harness-tools/yield.ts";
import { ralplanRoleForStage, runRalplanAgent } from "../workflows/ralplan/ralplan-agents.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "../workflows/ralplan/ralplan-runtime.ts";
import { maybeRedirectVagueExecution } from "../workflows/ralplan/vagueness-gate.ts";
import { readWorkflowActiveState, syncWorkflowActiveState } from "../workflows/shared/active-state.ts";
import { handoffWorkflow } from "../workflows/shared/handoff.ts";
import { workflowReceipt } from "../workflows/shared/receipts.ts";
import {
	deepInterviewIndexPath,
	deepInterviewSpecPath,
	workflowStatePath,
} from "../workflows/shared/session-layout.ts";
import { assertRalplanStage, assertSafePathComponent, assertWorkflowSkill } from "../workflows/shared/state-schema.ts";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "../workflows/shared/state-writer.ts";
import {
	activeRalplanRunId,
	clearWorkflowState,
	defaultWorkflowId,
	readWorkflowState,
	writeWorkflowState,
} from "../workflows/shared/workflow-state.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "../workflows/team/team-runtime.ts";
import { ultragoalGuard } from "../workflows/ultragoal/ultragoal-guard.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	startNextUltragoalGoal,
} from "../workflows/ultragoal/ultragoal-runtime.ts";

const workflowStateSchema = Type.Object({
	skill: Type.String({ description: "Workflow skill name: deep-interview, ralplan, team, or ultragoal" }),
	action: Type.Optional(Type.String({ description: "read, write, or clear. Defaults to read." })),
	phase: Type.Optional(Type.String({ description: "Phase to set for write/clear actions" })),
	active: Type.Optional(Type.Boolean({ description: "Active flag for write actions" })),
	data: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), { description: "State fields to merge for write actions" }),
	),
	force: Type.Optional(
		Type.Boolean({ description: "Force overwrite/clear of terminal or corrupt state. Defaults to false." }),
	),
});

type WorkflowStateInput = Static<typeof workflowStateSchema>;

const deepInterviewWriteSpecSchema = Type.Object({
	slug: Type.Optional(Type.String({ description: "Safe slug for .pi/specs/deep-interview-<slug>.md" })),
	spec: Type.String({ description: "Final spec markdown or a path to a markdown file" }),
	handoff: Type.Optional(Type.String({ description: "Optional next workflow: ralplan, ultragoal, team, or stop" })),
});

type DeepInterviewWriteSpecInput = Static<typeof deepInterviewWriteSpecSchema>;

const deepInterviewPlanQuestionSchema = Type.Object({
	round: Type.Number(),
	questionId: Type.Optional(Type.String()),
	questionText: Type.String(),
	component: Type.Optional(Type.String()),
	dimension: Type.Optional(Type.String()),
	ambiguity: Type.Optional(Type.Number()),
	rationale: Type.Optional(Type.String()),
});

type DeepInterviewPlanQuestionInput = Static<typeof deepInterviewPlanQuestionSchema>;

const deepInterviewRecordAnswerSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Optional(Type.Number()),
	roundId: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	questionText: Type.Optional(Type.String()),
	component: Type.Optional(Type.String()),
	dimension: Type.Optional(Type.String()),
	ambiguity: Type.Optional(Type.Number()),
	selectedOptions: Type.Optional(Type.Array(Type.String())),
	customInput: Type.Optional(Type.String()),
});

type DeepInterviewRecordAnswerInput = Static<typeof deepInterviewRecordAnswerSchema>;

const deepInterviewTriggerSchema = Type.Object({
	kind: Type.String(),
	name: Type.String(),
	status: Type.String(),
	component: Type.String(),
	dimension: Type.String(),
	priorDimensionScore: Type.Optional(Type.Number()),
	newDimensionScore: Type.Optional(Type.Number()),
	priorAmbiguity: Type.Optional(Type.Number()),
	newAmbiguity: Type.Optional(Type.Number()),
	evidence: Type.Optional(Type.String()),
	contradictedFactId: Type.Optional(Type.String()),
	rationale: Type.Optional(Type.String()),
});

const deepInterviewRecordScoringSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Number(),
	roundId: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	scores: Type.Record(Type.String(), Type.Number()),
	ambiguity: Type.Number(),
	triggers: Type.Optional(Type.Array(deepInterviewTriggerSchema)),
});

type DeepInterviewRecordScoringInput = Static<typeof deepInterviewRecordScoringSchema>;

const deepInterviewReadCompactSchema = Type.Object({
	lastN: Type.Optional(Type.Number()),
});

type DeepInterviewReadCompactInput = Static<typeof deepInterviewReadCompactSchema>;

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

const teamStartSchema = Type.Object({
	task: Type.String(),
	teamId: Type.Optional(Type.String()),
});
type TeamStartInput = Static<typeof teamStartSchema>;

const teamRunSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
});
type TeamRunInput = Static<typeof teamRunSchema>;

const teamCreateTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	id: Type.Optional(Type.String()),
	title: Type.String(),
	description: Type.String(),
	owner: Type.Optional(Type.String()),
	dependsOn: Type.Optional(Type.Array(Type.String())),
});
type TeamCreateTaskInput = Static<typeof teamCreateTaskSchema>;

const teamTransitionTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	taskId: Type.String(),
	status: Type.String(),
	workerId: Type.Optional(Type.String()),
	evidence: Type.Optional(
		Type.Object({
			summary: Type.String(),
			files: Type.Optional(Type.Array(Type.String())),
			verification: Type.Optional(Type.Array(Type.String())),
			recorded_by: Type.String(),
		}),
	),
});
type TeamTransitionTaskInput = Static<typeof teamTransitionTaskSchema>;

const teamMessageSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	from: Type.String(),
	to: Type.String(),
	body: Type.String(),
	idempotencyKey: Type.Optional(Type.String()),
});
type TeamMessageInput = Static<typeof teamMessageSchema>;

const teamCompleteSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	phase: Type.Optional(Type.String({ description: "complete, failed, or cancelled. Defaults to complete." })),
	summary: Type.Optional(Type.String()),
});
type TeamCompleteInput = Static<typeof teamCompleteSchema>;

const ultragoalCreatePlanSchema = Type.Object({
	brief: Type.String(),
	goalMode: Type.Optional(Type.String()),
});
type UltragoalCreatePlanInput = Static<typeof ultragoalCreatePlanSchema>;

const ultragoalCheckpointSchema = Type.Object({
	goalId: Type.String(),
	status: Type.String(),
	evidence: Type.Optional(Type.String()),
	qualityGate: Type.Optional(
		Type.Object(
			{
				executorQa: Type.Object(
					{
						artifactRefs: Type.Array(
							Type.Object(
								{
									id: Type.String(),
									kind: Type.String(),
									description: Type.String(),
									path: Type.Optional(Type.String()),
									inlineEvidence: Type.Optional(Type.Unknown()),
									verifiedReceipt: Type.Optional(Type.Unknown()),
									receipt: Type.Optional(Type.Unknown()),
								},
								{
									description:
										"Artifact reference: id, kind, description, and a path/inlineEvidence/verifiedReceipt proof.",
								},
							),
						),
						surfaceEvidence: Type.Array(
							Type.Object(
								{
									id: Type.String(),
									status: Type.Optional(Type.String()),
									surface: Type.String(),
									contractRef: Type.String(),
									invocation: Type.String(),
									verdict: Type.Optional(Type.String()),
									result: Type.Optional(Type.String()),
									reason: Type.Optional(Type.String()),
									artifactRefs: Type.Optional(Type.Array(Type.String())),
								},
								{
									description:
										"Surface evidence row: status, surface, contractRef, invocation, verdict/result, artifactRefs links.",
								},
							),
						),
					},
					{ description: "Executor QA evidence with artifactRefs and surfaceEvidence rows." },
				),
				contractCoverage: Type.Array(
					Type.Object(
						{
							id: Type.String(),
							contractRef: Type.String(),
							obligation: Type.String(),
							status: Type.Optional(Type.String()),
							reason: Type.Optional(Type.String()),
							surfaceEvidenceRefs: Type.Optional(Type.Array(Type.String())),
							artifactRefs: Type.Optional(Type.Array(Type.String())),
						},
						{ description: "Contract coverage row: contractRef, obligation, status, linked refs." },
					),
				),
			},
			{
				description:
					"Required for status 'complete'. Typed quality-gate rows (hard break): executorQa (artifactRefs + surfaceEvidence) and contractCoverage. Free-form {status} objects are rejected; the runtime validates the typed shape strictly.",
			},
		),
	),
});
type UltragoalCheckpointInput = Static<typeof ultragoalCheckpointSchema>;

const ultragoalGuardSchema = Type.Object({
	goalId: Type.Optional(Type.String({ description: "Goal id to inspect. Defaults to the active goal." })),
	currentObjective: Type.Optional(Type.String({ description: "Current objective text to match against the plan." })),
});
type UltragoalGuardInput = Static<typeof ultragoalGuardSchema>;

const ultragoalStartNextSchema = Type.Object({
	retryFailed: Type.Optional(Type.Boolean()),
});
type UltragoalStartNextInput = Static<typeof ultragoalStartNextSchema>;

const teamSpawnTaskAgentSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team run id. Defaults to the active team." })),
	taskId: Type.String({ description: "Task id to assign to the subagent." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to worker." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type TeamSpawnTaskAgentInput = Static<typeof teamSpawnTaskAgentSchema>;

const ultragoalSpawnGoalAgentSchema = Type.Object({
	goalId: Type.String({ description: "Goal id to assign to the subagent." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to worker." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type UltragoalSpawnGoalAgentInput = Static<typeof ultragoalSpawnGoalAgentSchema>;

const subagentSpawnSchema = Type.Object({
	agent: Type.Optional(
		Type.String({ description: "Agent profile name from .pi/agents, agentDir/agents, or built-ins." }),
	),
	role: Type.Optional(
		Type.String({ description: "Subagent role label. Defaults to agent profile name or subagent." }),
	),
	prompt: Type.String({ description: "User task prompt for the subagent." }),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	systemPrompt: Type.Optional(Type.String({ description: "Additional role/system instructions." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for this subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this subagent." }))),
	persistent: Type.Optional(
		Type.Boolean({ description: "Defaults to profile or true. False uses an in-memory session." }),
	),
	detached: Type.Optional(Type.Boolean({ description: "Return immediately after spawning." })),
	label: Type.Optional(Type.String({ description: "Human-readable subagent label." })),
});
type SubagentSpawnInput = Static<typeof subagentSpawnSchema>;

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

const subagentStatusSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Subagent id. Omit to list recent records." })),
	limit: Type.Optional(Type.Number({ description: "Maximum records when listing. Defaults to 10." })),
	verbosity: Type.Optional(
		Type.String({
			description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full (requires id).",
		}),
	),
});
type SubagentStatusInput = Static<typeof subagentStatusSchema>;

const subagentAwaitSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	timeoutMs: Type.Optional(
		Type.Number({ description: "Await timeout in milliseconds. Returns reason=timeout when exceeded." }),
	),
	verbosity: Type.Optional(
		Type.String({ description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full." }),
	),
});
type SubagentAwaitInput = Static<typeof subagentAwaitSchema>;

const subagentResumeSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Follow-up message to resume the saved subagent context." }),
});
type SubagentResumeInput = Static<typeof subagentResumeSchema>;

const subagentSteerSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Steering message to inject into the live subagent." }),
	delivery: Type.Optional(Type.String({ description: "steer (default) or followUp delivery mode." })),
});
type SubagentSteerInput = Static<typeof subagentSteerSchema>;

const subagentPauseSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentPauseInput = Static<typeof subagentPauseSchema>;

type DeepInterviewHandoff = "ralplan" | "team" | "ultragoal" | "stop";
type RalplanApprovalTarget = "ultragoal" | "team" | "stop";
type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

function assertDeepInterviewHandoff(value: string | undefined): asserts value is DeepInterviewHandoff | undefined {
	if (value === undefined) return;
	if (!["ralplan", "team", "ultragoal", "stop"].includes(value)) throw new Error(`unknown handoff workflow: ${value}`);
}

function assertRalplanApprovalTarget(value: string | undefined): asserts value is RalplanApprovalTarget | undefined {
	if (value === undefined) return;
	if (!["ultragoal", "team", "stop"].includes(value)) throw new Error(`unknown ralplan approval target: ${value}`);
}

function assertRalplanRole(value: string | undefined): asserts value is "planner" | "architect" | "critic" | undefined {
	if (value === undefined) return;
	if (!["planner", "architect", "critic"].includes(value)) throw new Error(`unknown ralplan agent role: ${value}`);
}

function assertAgentThinkingLevel(value: string | undefined): asserts value is AgentThinkingLevel | undefined {
	if (value === undefined) return;
	if (!["off", "minimal", "low", "medium", "high"].includes(value)) {
		throw new Error(`invalid agent thinkingLevel: ${value}`);
	}
}

async function executeWorkflowState(params: WorkflowStateInput, ctx: ExtensionContext) {
	const sessionId = ctx.sessionManager.getSessionId();
	assertWorkflowSkill(params.skill);
	const action = params.action ?? "read";
	if (action === "read") {
		const state = (await readWorkflowState(ctx.cwd, params.skill, { sessionId })) ?? null;
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ state }, null, 2) }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	if (action === "write") {
		const patch: Record<string, unknown> = { ...(params.data ?? {}) };
		if (params.phase) patch.current_phase = params.phase;
		if (typeof params.active === "boolean") patch.active = params.active;
		const state = await writeWorkflowState(ctx.cwd, params.skill, patch, "pi workflow state write", {
			force: params.force,
			sessionId,
		});
		await syncWorkflowActiveState(
			ctx.cwd,
			{
				skill: params.skill,
				active: state.active,
				phase: state.current_phase,
				state_path: workflowStatePath(ctx.cwd, params.skill, sessionId),
				hud:
					params.skill === "deep-interview"
						? deriveDeepInterviewHud(state, { phase: state.current_phase })
						: undefined,
			},
			{ sessionId },
		);
		return {
			content: [{ type: "text" as const, text: `Updated ${workflowStatePath(ctx.cwd, params.skill, sessionId)}` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	if (action === "clear") {
		const state = await clearWorkflowState(ctx.cwd, params.skill, params.data ?? {}, {
			force: params.force,
			sessionId,
		});
		await syncWorkflowActiveState(
			ctx.cwd,
			{
				skill: params.skill,
				active: state.active,
				phase: state.current_phase,
				state_path: workflowStatePath(ctx.cwd, params.skill, sessionId),
				hud:
					params.skill === "deep-interview"
						? deriveDeepInterviewHud(state, { phase: state.current_phase })
						: undefined,
			},
			{ sessionId },
		);
		return {
			content: [{ type: "text" as const, text: `Cleared ${params.skill} workflow state` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill, sessionId) }),
		};
	}
	throw new Error(`unknown workflow state action: ${action}`);
}

async function executeDeepInterviewPlanQuestion(params: DeepInterviewPlanQuestionInput, ctx: ExtensionContext) {
	const result = await planDeepInterviewQuestion(
		ctx.cwd,
		{
			round: params.round,
			questionId: params.questionId,
			questionText: params.questionText,
			component: params.component,
			dimension: params.dimension,
			ambiguity: params.ambiguity,
			rationale: params.rationale,
		},
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [{ type: "text" as const, text: `Planned deep-interview question round ${params.round}` }],
		details: workflowReceipt({ ...result }),
	};
}

function normalizeDeepInterviewTriggers(
	triggers: DeepInterviewRecordScoringInput["triggers"],
): DeepInterviewTriggerMetadata[] | undefined {
	if (!triggers) return undefined;
	return triggers.map((trigger) => {
		if (!["A", "B", "C", "D"].includes(trigger.kind)) throw new Error(`invalid trigger kind: ${trigger.kind}`);
		if (!["active", "disputed", "unresolved"].includes(trigger.status)) {
			throw new Error(`invalid trigger status: ${trigger.status}`);
		}
		return trigger as DeepInterviewTriggerMetadata;
	});
}

async function executeDeepInterviewRecordAnswer(params: DeepInterviewRecordAnswerInput, ctx: ExtensionContext) {
	const result = await appendOrMergeDeepInterviewRound(
		ctx.cwd,
		{
			interviewId: params.interviewId,
			round: params.round,
			round_id: params.roundId,
			questionId: params.questionId,
			questionText: params.questionText,
			component: params.component,
			dimension: params.dimension,
			ambiguity: params.ambiguity,
			selectedOptions: params.selectedOptions,
			customInput: params.customInput,
		},
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [
			{
				type: "text" as const,
				text: `Recorded deep-interview answer round ${result.record.round} (${result.action})`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewRecordScoring(params: DeepInterviewRecordScoringInput, ctx: ExtensionContext) {
	const result = await enrichDeepInterviewRoundScoring(
		ctx.cwd,
		{
			interviewId: params.interviewId,
			round: params.round,
			round_id: params.roundId,
			questionId: params.questionId,
			scores: params.scores,
			ambiguity: params.ambiguity,
			triggers: normalizeDeepInterviewTriggers(params.triggers),
		},
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [{ type: "text" as const, text: `Recorded deep-interview scoring round ${params.round}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewReadCompact(params: DeepInterviewReadCompactInput, ctx: ExtensionContext) {
	const result = await readDeepInterviewStateCompact(ctx.cwd, ctx.sessionManager.getSessionId(), params.lastN);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewWriteSpec(params: DeepInterviewWriteSpecInput, ctx: ExtensionContext) {
	const sessionId = ctx.sessionManager.getSessionId();
	assertDeepInterviewHandoff(params.handoff);
	const slug = params.slug?.trim() || defaultWorkflowId("spec");
	assertSafePathComponent(slug, "slug");
	const content = await readFileOrLiteral(params.spec, ctx.cwd);
	const result = await writeTextArtifact(deepInterviewSpecPath(ctx.cwd, slug, sessionId), content, { cwd: ctx.cwd });
	await appendJsonl(
		deepInterviewIndexPath(ctx.cwd, sessionId),
		{
			slug,
			path: result.path,
			sha256: result.sha256,
			created_at: result.createdAt,
		},
		{ cwd: ctx.cwd },
	);
	if (params.handoff === "ralplan" || params.handoff === "team" || params.handoff === "ultragoal") {
		// Gajae-faithful two-step handoff (revises spec decision #3, which bypassed
		// finalize and broke the cold-start case where no deep-interview state
		// exists yet). Step 1: `finalizeDeepInterviewSpecState` persists the caller
		// state with spec fields, active:true, current_phase:"handoff" (a regular
		// write — NOT the handoff). Step 2: `handoffWorkflow` demotes the caller
		// (active:false, handoff_to), promotes the callee, writes the transaction
		// journal, and applies the active-state handoff. Same-phase handoff->handoff
		// (handoff-send) is allowed by the transition gate (known same-phase returns
		// early), so the demote does not throw. Spec fields travel via finalize; the
		// caller patch below is empty. The spec-artifact + index writes above remain.
		await finalizeDeepInterviewSpecState(
			ctx.cwd,
			{ slug, path: result.path, sha256: result.sha256, handoff: params.handoff },
			sessionId,
		);
		const calleePatch =
			params.handoff === "ralplan"
				? {
						run_id: (await activeRalplanRunId(ctx.cwd, sessionId)) ?? defaultWorkflowId("ralplan"),
						input: result.path,
					}
				: { input: result.path };
		await handoffWorkflow({
			cwd: ctx.cwd,
			caller: {
				skill: "deep-interview",
				patch: {},
			},
			callee: {
				skill: params.handoff,
				patch: calleePatch,
			},
			command: "pi deep-interview write-spec",
			sessionId,
		});
	} else {
		// stop / no-handoff branch: finalize + direct active-state sync (unchanged).
		await finalizeDeepInterviewSpecState(
			ctx.cwd,
			{
				slug,
				path: result.path,
				sha256: result.sha256,
				handoff: params.handoff,
			},
			sessionId,
		);
	}
	return {
		content: [{ type: "text" as const, text: `Persisted deep-interview spec at ${result.path}` }],
		details: workflowReceipt({ slug, path: result.path, sha256: result.sha256, handoff: params.handoff }),
	};
}

function syncMcpHudUi(ctx: ExtensionContext): void {
	const infos = ctx.getMcpServerInfos();
	if (infos.length === 0) {
		ctx.ui.setStatus("mcp", undefined);
		ctx.ui.setWidget("mcp", undefined);
		return;
	}
	const connected = infos.filter((info) => info.status === "connected");
	const failed = infos.filter((info) => info.status === "failed");
	const disconnected = infos.filter((info) => info.status === "disconnected");
	const toolCount = infos.reduce((sum, info) => sum + info.toolCount, 0);
	const summary = [
		`MCP ${connected.length}/${infos.length}`,
		`${toolCount} tool${toolCount === 1 ? "" : "s"}`,
		...(failed.length > 0 ? [`${failed.length} failed`] : []),
		...(disconnected.length > 0 ? [`${disconnected.length} disconnected`] : []),
	].join(" | ");
	ctx.ui.setStatus("mcp", summary);
	if (ctx.mode !== "tui") return;
	const lines = infos.map((info) => {
		const suffix = info.error ? ` — ${info.error}` : ` — ${info.toolCount} tool${info.toolCount === 1 ? "" : "s"}`;
		return `${info.name}: ${info.status}${suffix}`;
	});
	ctx.ui.setWidget("mcp", ["MCP", ...lines], { placement: "aboveEditor" });
}

async function syncWorkflowHudUi(_ctx: ExtensionContext): Promise<void> {
	// The workflow HUD now renders from StatusLineComponent's background-refreshed
	// active-state cache. Keep these hook registrations for lifecycle coverage,
	// but do not mirror workflow data into extension status/widget slots.
}

async function buildDeepInterviewContinuationPrompt(cwd: string, sessionId: string): Promise<string | undefined> {
	const active = await readWorkflowActiveState(cwd, { sessionId }).catch(() => undefined);
	const deepInterview = active?.active_workflows.find((entry) => entry.skill === "deep-interview" && entry.active);
	if (!deepInterview) return undefined;
	const state = await readWorkflowState(cwd, "deep-interview", { sessionId }).catch(() => undefined);
	if (!state || state.active === false) return undefined;
	const compact = projectCompactState(state, { lastN: 3 });
	return [
		"Active Pi deep-interview runtime context:",
		JSON.stringify(
			{ state_path: workflowStatePath(cwd, "deep-interview", sessionId), hud: deepInterview.hud, compact },
			null,
			2,
		),
		"Continue the interview autonomously using runtime orchestration state. If orchestration.status is waiting_for_answer, treat the user's message as the answer to orchestration.next_question and call deep_interview_record_answer without restating question metadata unless needed. If status is pending_scoring, call deep_interview_record_scoring before asking another question. If no question is pending and ambiguity is above threshold, call deep_interview_plan_question before asking exactly one next Socratic question. If ambiguity is at or below threshold, restate the goal and ask for confirmation before deep_interview_write_spec.",
	].join("\n");
}

function requireSubagentManager(ctx: ExtensionContext) {
	if (!ctx.subagents) throw new Error("No subagent manager is available in this session.");
	return ctx.subagents;
}

const RECEIPT_MAX = 280;
const PREVIEW_MAX = 2000;
const FULL_MAX = 12000;
type SubagentVerbosity = "receipt" | "preview" | "full";

function normalizeSubagentVerbosity(value: string | undefined): SubagentVerbosity {
	if (value === undefined) return "receipt";
	if (value === "receipt" || value === "preview" || value === "full") return value;
	throw new Error(`invalid subagent verbosity: ${value}`);
}

function truncateOutput(text: string | undefined, verbosity: SubagentVerbosity): string {
	if (!text) return "";
	const max = verbosity === "full" ? FULL_MAX : verbosity === "preview" ? PREVIEW_MAX : RECEIPT_MAX;
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n...[truncated]`;
}

function formatSubagentRecord(
	record:
		| {
				id: string;
				role: string;
				status: string;
				created_at?: string;
				updated_at?: string;
				result_text?: string;
				error_text?: string;
				session_file?: string;
		  }
		| undefined,
	verbosity: SubagentVerbosity,
): string {
	if (!record) return "Subagent not found";
	const output = truncateOutput(record.result_text ?? record.error_text, verbosity);
	return JSON.stringify(
		{
			id: record.id,
			role: record.role,
			status: record.status,
			created_at: record.created_at,
			updated_at: record.updated_at,
			...(output ? { output } : {}),
			...(record.session_file ? { session_file: record.session_file } : {}),
		},
		null,
		2,
	);
}

async function executeSubagentSpawn(params: SubagentSpawnInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent,
		role: params.role,
		prompt: params.prompt,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		systemPrompt: params.systemPrompt,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: params.persistent,
		detached: params.detached,
		label: params.label,
		parentSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.record.id} ${result.record.status}` }],
		details: workflowReceipt({ record: result.record, output: result.output }),
	};
}

async function executeSubagentStatus(params: SubagentStatusInput, ctx: ExtensionContext) {
	const manager = requireSubagentManager(ctx);
	const verbosity = normalizeSubagentVerbosity(params.verbosity);
	if (verbosity === "full" && !params.id) {
		throw new Error("verbosity=full requires an explicit subagent id.");
	}
	if (params.id) {
		const record = await manager.read(params.id);
		return {
			content: [{ type: "text" as const, text: formatSubagentRecord(record, verbosity) }],
			details: workflowReceipt({ record: record ?? null }),
		};
	}
	const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 10)));
	const records = (await manager.list()).slice(0, limit);
	const summary = records.map((r) => ({
		id: r.id,
		role: r.role,
		status: r.status,
		output: truncateOutput(r.result_text ?? r.error_text, verbosity),
	}));
	return {
		content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
		details: workflowReceipt({ records }),
	};
}

async function executeSubagentAwait(params: SubagentAwaitInput, ctx: ExtensionContext) {
	const manager = requireSubagentManager(ctx);
	const verbosity = normalizeSubagentVerbosity(params.verbosity);
	const result = await manager.waitFor(params.id, { timeoutMs: params.timeoutMs });
	if (!result.ok) {
		const progressText = result.progress ? `\n\n${renderSubagentProgress(result.progress)}` : "";
		return {
			content: [
				{
					type: "text" as const,
					text:
						result.reason === "timeout"
							? `Subagent ${params.id} await timed out after ${params.timeoutMs}ms${progressText}`
							: `Subagent ${params.id} not found`,
				},
			],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: formatSubagentRecord(result.result.record, verbosity) }],
		details: workflowReceipt({ ok: true, record: result.result.record, output: result.result.output }),
	};
}

async function executeSubagentResume(params: SubagentResumeInput, ctx: ExtensionContext, signal?: AbortSignal) {
	const result = await requireSubagentManager(ctx).resume(params.id, params.message, { signal });
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} resume failed: ${result.reason}` }],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} ${result.result.record.status}` }],
		details: workflowReceipt({ ok: true, record: result.result.record, output: result.result.output }),
	};
}

async function executeSubagentSteer(params: SubagentSteerInput, ctx: ExtensionContext) {
	const delivery = params.delivery === "followUp" ? "followUp" : "steer";
	const result = await requireSubagentManager(ctx).steer(params.id, params.message, delivery);
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} steer failed: ${result.reason}` }],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} steered` }],
		details: workflowReceipt({ ok: true, record: result.result.record }),
	};
}

async function executeSubagentPause(params: SubagentPauseInput, ctx: ExtensionContext) {
	const result = await requireSubagentManager(ctx).pause(params.id);
	return {
		content: [
			{
				type: "text" as const,
				text: result.ok
					? `Subagent ${result.record?.id} paused`
					: `Subagent ${params.id} pause failed: ${result.reason}`,
			},
		],
		details: workflowReceipt({ ok: result.ok, reason: result.reason, record: result.record }),
	};
}

async function executeSubagentCancel(params: SubagentIdInput, ctx: ExtensionContext) {
	const record = await requireSubagentManager(ctx).cancel(params.id);
	return {
		content: [
			{
				type: "text" as const,
				text: record ? `Subagent ${record.id} cancelled` : `Subagent ${params.id} not found`,
			},
		],
		details: workflowReceipt({ record: record ?? null }),
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

async function executeTeamStart(params: TeamStartInput, ctx: ExtensionContext) {
	const vagueness = maybeRedirectVagueExecution("team", params.task);
	if (vagueness.redirect) {
		throw new Error(vagueness.message);
	}
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await startTeam(
		ctx.cwd,
		{ task: params.task, teamId: params.teamId },
		ctx.sessionManager.getSessionId(),
	);
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Started team ${result.team_id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamSnapshot(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamReadCompact(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamCompact(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamCreateTask(params: TeamCreateTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (params.id) assertSafePathComponent(params.id, "taskId");
	const result = await createTeamTask(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Created team task ${result.id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamTransitionTask(params: TeamTransitionTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.taskId, "taskId");
	if (params.workerId) assertSafePathComponent(params.workerId, "workerId");
	const result = await transitionTeamTask(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Updated team task ${result.id} to ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamMessage(params: TeamMessageInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.from, "from");
	assertSafePathComponent(params.to, "to");
	const result = await sendTeamMessage(ctx.cwd, params, ctx.sessionManager.getSessionId());
	return {
		content: [{ type: "text" as const, text: `Sent team message ${result.message_id}` }],
		details: workflowReceipt(result),
	};
}

async function executeTeamComplete(params: TeamCompleteInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (
		params.phase !== undefined &&
		params.phase !== "complete" &&
		params.phase !== "failed" &&
		params.phase !== "cancelled"
	) {
		throw new Error(`invalid team completion phase: ${params.phase}`);
	}
	const result = await completeTeam(
		ctx.cwd,
		{
			teamId: params.teamId,
			phase: params.phase,
			summary: params.summary,
		},
		ctx.sessionManager.getSessionId(),
	);
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Closed team ${result.team_id} as ${result.phase}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamSpawnTaskAgent(params: TeamSpawnTaskAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const snapshot = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	const task = snapshot.tasks.find((t) => t.id === params.taskId);
	if (!task) throw new Error(`team task not found: ${params.taskId}`);
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent ?? "worker",
		role: `team-worker-${task.id}`,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		prompt: `Execute team task "${task.title}": ${task.description}${task.owner ? ` (owner: ${task.owner})` : ""}`,
		systemPrompt: `You are a team worker executing task "${task.title}" (id: ${task.id}). Follow the task description precisely and report completion with evidence.`,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: true,
		label: `team-${snapshot.team_id}-${task.id}`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned subagent ${result.record.id} for task ${task.id}` }],
		details: workflowReceipt({ task, subagent: result.record }),
	};
}

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

export default function workflowsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
		syncMcpHudUi(ctx);
	});
	pi.on("turn_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("tool_execution_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.skipWorkflowContinuation) return undefined;
		await syncWorkflowHudUi(ctx);
		const continuationPrompt = await buildDeepInterviewContinuationPrompt(ctx.cwd, ctx.sessionManager.getSessionId());
		if (!continuationPrompt) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${continuationPrompt}` };
	});

	pi.registerTool({
		name: "pi_workflow_state",
		label: "Pi Workflow State",
		description: "Read, write, or clear Pi workflow state under .pi/workflows/<skill>/state.json.",
		promptSnippet: "Read/write Pi workflow state for deep-interview, ralplan, team, and ultragoal",
		promptGuidelines: ["Use pi_workflow_state instead of direct edits when reading or updating .pi/workflows state."],
		parameters: workflowStateSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeWorkflowState(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_plan_question",
		label: "Deep Interview Question Plan",
		description: "Plan the next deep-interview question and mark the workflow as waiting for an answer.",
		promptSnippet: "Plan the next deep-interview question before asking the user",
		promptGuidelines: [
			"Use deep_interview_plan_question immediately before asking a deep-interview question so the next user answer can be recorded against the pending question.",
		],
		parameters: deepInterviewPlanQuestionSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewPlanQuestion(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_record_answer",
		label: "Deep Interview Answer",
		description: "Record or replace one answered deep-interview round in .pi workflow state.",
		promptSnippet: "Record deep-interview answer shells in workflow state",
		promptGuidelines: [
			"Use deep_interview_record_answer after each deep-interview question is answered instead of editing workflow state directly.",
		],
		parameters: deepInterviewRecordAnswerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewRecordAnswer(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_record_scoring",
		label: "Deep Interview Scoring",
		description: "Enrich a deep-interview round with scores, ambiguity, and trigger metadata.",
		promptSnippet: "Record deep-interview scoring and ambiguity transitions",
		promptGuidelines: [
			"Use deep_interview_record_scoring after scoring each deep-interview answer; invalid ambiguity-raising transitions are rejected.",
		],
		parameters: deepInterviewRecordScoringSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewRecordScoring(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_read_compact",
		label: "Deep Interview Compact State",
		description: "Read a compact deep-interview state projection for prompt-efficient continuation.",
		promptSnippet: "Read compact deep-interview state for continuation",
		promptGuidelines: [
			"Use deep_interview_read_compact when continuing a deep interview instead of loading the full transcript unless necessary.",
		],
		parameters: deepInterviewReadCompactSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_write_spec",
		label: "Deep Interview Spec",
		description: "Persist a final deep-interview spec under .pi/specs and update workflow state.",
		promptSnippet: "Persist final deep-interview specs under .pi/specs",
		promptGuidelines: [
			"Use deep_interview_write_spec to persist final deep-interview specs; do not write .pi/specs directly.",
		],
		parameters: deepInterviewWriteSpecSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewWriteSpec(params, ctx),
	});

	pi.registerTool({
		name: "subagent_spawn",
		label: "Subagent Spawn",
		description: "Spawn a Pi-native subagent session with optional restricted tools and persistence.",
		promptSnippet: "Spawn a durable Pi subagent for isolated work",
		promptGuidelines: ["Use subagent_spawn when work should run in an isolated agent context."],
		parameters: subagentSpawnSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentSpawn(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_status",
		label: "Subagent Status",
		description: "Read one subagent record or list recent subagent records.",
		promptSnippet: "Inspect Pi-native subagent records",
		promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
		parameters: subagentStatusSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentStatus(params, ctx),
	});

	pi.registerTool({
		name: "subagent_await",
		label: "Subagent Await",
		description: "Await a live subagent or read its terminal result.",
		promptSnippet: "Await Pi-native subagent completion",
		promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
		parameters: subagentAwaitSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentAwait(params, ctx),
	});

	pi.registerTool({
		name: "subagent_steer",
		label: "Subagent Steer",
		description: "Inject a steering message into a live subagent or resume it from saved context.",
		promptSnippet: "Steer a live Pi-native subagent",
		promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
		parameters: subagentSteerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentSteer(params, ctx),
	});

	pi.registerTool({
		name: "subagent_pause",
		label: "Subagent Pause",
		description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
		promptSnippet: "Pause a running Pi-native subagent",
		promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
		parameters: subagentPauseSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentPause(params, ctx),
	});

	pi.registerTool({
		name: "subagent_resume",
		label: "Subagent Resume",
		description: "Resume a saved persistent subagent session with a follow-up message.",
		promptSnippet: "Resume a Pi-native subagent from saved context",
		promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
		parameters: subagentResumeSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentResume(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_cancel",
		label: "Subagent Cancel",
		description: "Cancel a live or durable subagent record.",
		promptSnippet: "Cancel a Pi-native subagent",
		promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentCancel(params, ctx),
	});

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

	pi.registerTool({
		name: "team_start",
		label: "Team Start",
		description: "Create Pi-native team coordination state under .pi/team/<team-id>.",
		promptSnippet: "Start a runtime-owned team coordination board",
		promptGuidelines: ["Use team_start only after execution is approved and parallel workstreams are useful."],
		parameters: teamStartSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamStart(params, ctx),
	});

	pi.registerTool({
		name: "team_snapshot",
		label: "Team Snapshot",
		description: "Read team workers, tasks, counts, and phase.",
		promptSnippet: "Read full team coordination snapshot",
		promptGuidelines: ["Use team_snapshot when auditing or integrating team work."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamSnapshot(params, ctx),
	});

	pi.registerTool({
		name: "team_read_compact",
		label: "Team Compact State",
		description: "Read compact team state for continuation.",
		promptSnippet: "Read compact team task/worker status",
		promptGuidelines: ["Use team_read_compact for prompt-efficient team continuation."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "team_create_task",
		label: "Team Task Create",
		description: "Create a durable team task.",
		promptSnippet: "Create team task with objective and ownership",
		promptGuidelines: ["Use team_create_task for each independent workstream before executing it."],
		parameters: teamCreateTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamCreateTask(params, ctx),
	});

	pi.registerTool({
		name: "team_transition_task",
		label: "Team Task Transition",
		description: "Transition a team task with required completion evidence for completed tasks.",
		promptSnippet: "Update team task state and completion evidence",
		promptGuidelines: ["Use team_transition_task when starting, blocking, completing, or failing team tasks."],
		parameters: teamTransitionTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamTransitionTask(params, ctx),
	});

	pi.registerTool({
		name: "team_send_message",
		label: "Team Message",
		description: "Append a durable mailbox message for a team participant.",
		promptSnippet: "Send team coordination mailbox message",
		promptGuidelines: ["Use team_send_message to record cross-workstream coordination decisions."],
		parameters: teamMessageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamMessage(params, ctx),
	});

	pi.registerTool({
		name: "team_complete",
		label: "Team Complete",
		description: "Close a team run as complete, failed, or cancelled.",
		promptSnippet: "Close team coordination runtime state",
		promptGuidelines: [
			"Use team_complete after integration and verification are complete, or to record failure/cancellation.",
		],
		parameters: teamCompleteSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamComplete(params, ctx),
	});

	pi.registerTool({
		name: "team_spawn_task_agent",
		label: "Team Spawn Task Agent",
		description: "Spawn a subagent to execute a team task.",
		promptSnippet: "Spawn agent for team task",
		promptGuidelines: ["Use team_spawn_task_agent to assign a team task to an autonomous subagent worker."],
		parameters: teamSpawnTaskAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeTeamSpawnTaskAgent(params, ctx, signal),
	});

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
		name: "ultragoal_guard",
		label: "Ultragoal Guard",
		description:
			"Read ultragoal verification state and report a 9-state diagnostic (inactive, unrelated_goal, active_verified_complete, active_missing_receipt, active_stale_receipt, active_missing_final_receipt, active_dirty_quality_gate, active_review_blocked_unrecorded, unreadable_fail_closed). Use before declaring an ultragoal goal complete to confirm the completion receipt is fresh.",
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

	// Subagent structured completion and intermediate reporting tools.
	// These are available to subagent sessions for structured output.
	pi.registerTool(createYieldToolDefinition());
	pi.registerTool(createReportFindingToolDefinition());

	// Additional high-ROI tools.
	pi.registerTool(createFetchToolDefinition());
	pi.registerTool(createGithubToolDefinition());
}
