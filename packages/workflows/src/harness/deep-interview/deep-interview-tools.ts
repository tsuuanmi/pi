import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { readWorkflowActiveState } from "../shared/active-state.ts";
import { handoffWorkflow } from "../shared/handoff.ts";
import { workflowReceipt } from "../shared/receipts.ts";
import { deepInterviewIndexPath, deepInterviewSpecPath, workflowStatePath } from "../shared/session-layout.ts";
import { assertSafePathComponent } from "../shared/state-schema.ts";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "../shared/state-writer.ts";
import { activeRalplanRunId, defaultWorkflowId, readWorkflowState } from "../shared/workflow-state.ts";
import { assertDeepInterviewHandoff } from "../shared/workflow-tool-utils.ts";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
	restateGoalGate,
	runClosureAcceptanceGuard,
} from "./deep-interview-runtime.ts";
import {
	type DeepInterviewTriggerMetadata,
	normalizeDeepInterviewEnvelope,
	projectCompactState,
} from "./deep-interview-state.ts";

const deepInterviewWriteSpecSchema = Type.Object({
	slug: Type.Optional(Type.String({ description: "Safe slug for .pi/<session-id>/specs/deep-interview-<slug>.md" })),
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
	topology: Type.Optional(Type.Unknown()),
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

const deepInterviewAdvisoryMetadataSchema = Type.Object({
	auto_answer_streak: Type.Optional(Type.Number()),
	refined_rounds: Type.Optional(Type.Array(Type.Number())),
	ambiguity_milestone: Type.Optional(Type.String()),
	lateral_reviews: Type.Optional(Type.Array(Type.Unknown())),
	lateral_panel_failures: Type.Optional(Type.Number()),
	auto_researched_rounds: Type.Optional(Type.Array(Type.Number())),
	auto_answered_rounds: Type.Optional(Type.Array(Type.Number())),
	architect_failures: Type.Optional(Type.Number()),
	established_facts: Type.Optional(Type.Array(Type.Unknown())),
	ontology_snapshots: Type.Optional(Type.Array(Type.Unknown())),
	topology: Type.Optional(Type.Unknown()),
});

const deepInterviewRecordScoringSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Number(),
	roundId: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	scores: Type.Record(Type.String(), Type.Number()),
	ambiguity: Type.Number(),
	triggers: Type.Optional(Type.Array(deepInterviewTriggerSchema)),
	metadata: Type.Optional(deepInterviewAdvisoryMetadataSchema),
});

type DeepInterviewRecordScoringInput = Static<typeof deepInterviewRecordScoringSchema>;

const deepInterviewReadCompactSchema = Type.Object({
	lastN: Type.Optional(Type.Number()),
});

type DeepInterviewReadCompactInput = Static<typeof deepInterviewReadCompactSchema>;

const deepInterviewRestateGoalSchema = Type.Object({
	restatedGoal: Type.String({ description: "One-sentence goal covering every active topology component" }),
	confirm: Type.Union([Type.Literal("Yes"), Type.Literal("Adjust"), Type.Literal("Missing")], {
		description: "Yes crystallizes; Adjust re-scores with adjusted wording; Missing adds scope and re-scores",
	}),
	adjustment: Type.Optional(Type.String({ description: "Exact correction text when confirm is Adjust or Missing" })),
});

type DeepInterviewRestateGoalInput = Static<typeof deepInterviewRestateGoalSchema>;

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
			topology: params.topology,
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
			metadata: params.metadata,
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

async function executeDeepInterviewRestateGoal(params: DeepInterviewRestateGoalInput, ctx: ExtensionContext) {
	const result = await restateGoalGate(
		ctx.cwd,
		{ restatedGoal: params.restatedGoal, confirm: params.confirm, adjustment: params.adjustment },
		ctx.sessionManager.getSessionId(),
	);
	return {
		content: [
			{
				type: "text" as const,
				text: result.ok
					? `Deep-interview restate gate confirmed: ${params.restatedGoal}`
					: `Deep-interview restate gate not confirmed (${params.confirm}); loops remaining: ${result.loops_remaining}`,
			},
		],
		details: workflowReceipt({ ...result, restated_goal: params.restatedGoal, confirm: params.confirm }),
	};
}

async function executeDeepInterviewClosureCheck(_params: Record<string, unknown>, ctx: ExtensionContext) {
	const sessionId = ctx.sessionManager.getSessionId();
	const envelope = await readWorkflowState(ctx.cwd, "deep-interview", { sessionId });
	const result = runClosureAcceptanceGuard(normalizeDeepInterviewEnvelope(envelope));
	return {
		content: [
			{
				type: "text" as const,
				text: result.ok
					? "Deep-interview closure guard passed: every active component has goal/constraints/criteria coverage and no unresolved trigger blocks closure."
					: `Deep-interview closure guard refused:${result.gaps.length > 0 ? `\n- ${result.gaps.join("\n- ")}` : ""}`,
			},
		],
		details: workflowReceipt({ ...result, statePath: workflowStatePath(ctx.cwd, "deep-interview", sessionId) }),
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

export async function buildDeepInterviewContinuationPrompt(
	cwd: string,
	sessionId: string,
): Promise<string | undefined> {
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

export function registerDeepInterviewTools(pi: ExtensionAPI): void {
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
		name: "deep_interview_closure_check",
		label: "Deep Interview Closure Check",
		description:
			"Run the deep-interview closure/acceptance guard against current state. Returns ok plus the list of blocking gaps (unresolved triggers, uncovered active component/dimension pairs).",
		promptSnippet: "Run the deep-interview closure acceptance guard before crystallizing the spec",
		promptGuidelines: [
			"Use deep_interview_closure_check before deep_interview_write_spec; if it refuses, ask one highest-impact follow-up and return to questioning instead of crystallizing.",
		],
		parameters: Type.Object({}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
			executeDeepInterviewClosureCheck(params as Record<string, unknown>, ctx),
	});

	pi.registerTool({
		name: "deep_interview_restate_goal",
		label: "Deep Interview Restate Goal",
		description:
			"Confirm the one-sentence restated goal covering every active component. Yes crystallizes; Adjust/Missing route back through scoring (capped at two loops).",
		promptSnippet: "Confirm the one-sentence restated goal before crystallizing the spec",
		promptGuidelines: [
			"Use deep_interview_restate_goal to confirm the restated goal after deep_interview_closure_check passes; it enforces the two-loop cap and records closure overrides safely.",
		],
		parameters: deepInterviewRestateGoalSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewRestateGoal(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_write_spec",
		label: "Deep Interview Spec",
		description: "Persist a final deep-interview spec under .pi/<session-id>/specs and update workflow state.",
		promptSnippet: "Persist final deep-interview specs under .pi/<session-id>/specs",
		promptGuidelines: [
			"Use deep_interview_write_spec to persist final deep-interview specs; do not write .pi/<session-id>/specs directly.",
		],
		parameters: deepInterviewWriteSpecSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewWriteSpec(params, ctx),
	});
}
