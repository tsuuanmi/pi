import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import {
	appendOrMergeDeepInterviewRound,
	assertDeepInterviewSpecReady,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
	restateGoalGate,
	runClosureCheckForSession,
} from "#workflows/harness/deep-interview/deep-interview-runtime";
import type {
	DeepInterviewAdvisoryMetadata,
	DeepInterviewRoundRecord,
} from "#workflows/harness/deep-interview/deep-interview-state";
import { workflowReceipt } from "#workflows/harness/shared/artifacts/artifacts";
import { handoffWorkflow } from "#workflows/harness/shared/orchestration/handoff";
import { assertDeepInterviewHandoff } from "#workflows/harness/shared/orchestration/workflow-tool-utils";
import { deepInterviewIndexPath, deepInterviewSpecPath } from "#workflows/harness/shared/session/session-layout";
import { assertSafePathComponent } from "#workflows/harness/shared/state/state-schema";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "#workflows/harness/shared/state/state-writer";
import { activeRalplanRunId, defaultWorkflowId } from "#workflows/harness/shared/state/workflow-state";

const planQuestionSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Number({ description: "Question round number." }),
	questionId: Type.Optional(Type.String({ description: "Stable question id." })),
	questionText: Type.String({ description: "The exact one-question prompt to ask." }),
	component: Type.Optional(Type.String({ description: "Target topology component id or name." })),
	dimension: Type.Optional(Type.String({ description: "Target clarity dimension." })),
	ambiguity: Type.Optional(Type.Number({ description: "Ambiguity at ask time." })),
	rationale: Type.Optional(Type.String({ description: "Why this component/dimension is the bottleneck." })),
});

const recordAnswerSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Optional(Type.Number()),
	round_id: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	questionText: Type.Optional(Type.String()),
	component: Type.Optional(Type.String()),
	dimension: Type.Optional(Type.String()),
	ambiguity: Type.Optional(Type.Number()),
	selectedOptions: Type.Optional(Type.Array(Type.String())),
	customInput: Type.Optional(Type.String()),
	topology: Type.Optional(Type.Any()),
});

const recordScoringSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Number(),
	round_id: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	scores: Type.Record(Type.String(), Type.Number()),
	ambiguity: Type.Number(),
	triggers: Type.Optional(Type.Array(Type.Any())),
	metadata: Type.Optional(Type.Any()),
});

const readCompactSchema = Type.Object({
	lastN: Type.Optional(Type.Number({ description: "Number of recent scored rounds to include." })),
});

const restateGoalSchema = Type.Object({
	restatedGoal: Type.String({ description: "One-sentence goal to confirm." }),
	confirm: Type.String({ description: "Yes, Adjust, or Missing." }),
	adjustment: Type.Optional(Type.String()),
});

const writeSpecSchema = Type.Object({
	slug: Type.Optional(Type.String({ description: "Safe spec slug. Defaults to generated spec id." })),
	spec: Type.String({ description: "Markdown spec content or a readable path to spec content." }),
	handoff: Type.Optional(Type.String({ description: "ralplan, ultragoal, team, or stop." })),
	allowEarlyExit: Type.Optional(
		Type.Boolean({ description: "Allow above-threshold ambiguity after explicit early exit." }),
	),
});

type PlanQuestionInput = Static<typeof planQuestionSchema>;
type RecordAnswerInput = Static<typeof recordAnswerSchema>;
type RecordScoringInput = Static<typeof recordScoringSchema>;
type ReadCompactInput = Static<typeof readCompactSchema>;
type RestateGoalInput = Static<typeof restateGoalSchema>;
type WriteSpecInput = Static<typeof writeSpecSchema>;

function sessionId(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

function textResult(text: string, details: unknown) {
	return { content: [{ type: "text" as const, text }], details: workflowReceipt(details as Record<string, unknown>) };
}

async function executeWriteSpec(params: WriteSpecInput, ctx: ExtensionContext) {
	await assertDeepInterviewSpecReady(ctx.cwd, sessionId(ctx), { allowEarlyExit: params.allowEarlyExit === true });
	const slug = params.slug?.trim() || defaultWorkflowId("spec");
	assertSafePathComponent(slug, "slug");
	assertDeepInterviewHandoff(params.handoff);
	const content = await readFileOrLiteral(params.spec, ctx.cwd);
	const specPath = deepInterviewSpecPath(ctx.cwd, slug, sessionId(ctx));
	const result = await writeTextArtifact(specPath, content, { cwd: ctx.cwd });
	await appendJsonl(
		deepInterviewIndexPath(ctx.cwd, sessionId(ctx)),
		{ slug, path: result.path, sha256: result.sha256, created_at: result.createdAt },
		{ cwd: ctx.cwd },
	);
	const handoffTarget = params.handoff === "stop" ? undefined : params.handoff;
	if (handoffTarget === "ralplan" || handoffTarget === "team" || handoffTarget === "ultragoal") {
		await finalizeDeepInterviewSpecState(
			ctx.cwd,
			{ slug, path: result.path, sha256: result.sha256, handoff: handoffTarget },
			sessionId(ctx),
		);
		const calleePatch =
			handoffTarget === "ralplan"
				? {
						run_id: (await activeRalplanRunId(ctx.cwd, sessionId(ctx))) ?? defaultWorkflowId("ralplan"),
						input: result.path,
					}
				: { input: result.path };
		await handoffWorkflow({
			cwd: ctx.cwd,
			caller: { skill: "deep-interview", patch: {} },
			callee: { skill: handoffTarget, patch: calleePatch },
			command: "deep_interview_write_spec",
			sessionId: sessionId(ctx),
		});
	} else {
		await finalizeDeepInterviewSpecState(
			ctx.cwd,
			{ slug, path: result.path, sha256: result.sha256, handoff: params.handoff ?? "stop" },
			sessionId(ctx),
		);
	}
	return textResult(`deep-interview spec written: ${result.path}`, {
		slug,
		path: result.path,
		sha256: result.sha256,
		handoff: params.handoff ?? "stop",
	});
}

export function registerDeepInterviewTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "deep_interview_plan_question",
		label: "Deep Interview Plan Question",
		description: "Plan the next Deep Interview question and mark the workflow as waiting for an answer.",
		promptSnippet: "Plan the next Deep Interview question before asking it",
		parameters: planQuestionSchema,
		execute: async (_id, params: PlanQuestionInput, _signal, _onUpdate, ctx) => {
			const result = await planDeepInterviewQuestion(ctx.cwd, params, sessionId(ctx));
			return textResult("deep-interview question planned", result);
		},
	});
	pi.registerTool({
		name: "deep_interview_record_answer",
		label: "Deep Interview Record Answer",
		description: "Record or replace a Deep Interview answer shell, including optional topology lock.",
		promptSnippet: "Record each Deep Interview answer before scoring",
		parameters: recordAnswerSchema,
		execute: async (_id, params: RecordAnswerInput, _signal, _onUpdate, ctx) => {
			const result = await appendOrMergeDeepInterviewRound(ctx.cwd, params, sessionId(ctx));
			return textResult(`deep-interview answer ${result.action}`, result);
		},
	});
	pi.registerTool({
		name: "deep_interview_record_scoring",
		label: "Deep Interview Record Scoring",
		description: "Record scores, ambiguity, trigger metadata, and advisory counters for a Deep Interview round.",
		promptSnippet: "Record Deep Interview scoring after each answer",
		parameters: recordScoringSchema,
		execute: async (_id, params: RecordScoringInput, _signal, _onUpdate, ctx) => {
			const result = await enrichDeepInterviewRoundScoring(
				ctx.cwd,
				{
					...params,
					triggers: (params.triggers as DeepInterviewRoundRecord["triggers"]) ?? [],
					metadata: params.metadata as DeepInterviewAdvisoryMetadata | undefined,
				},
				sessionId(ctx),
			);
			return textResult("deep-interview scoring recorded", result);
		},
	});
	pi.registerTool({
		name: "deep_interview_read_compact",
		label: "Deep Interview Read Compact",
		description: "Read a compact Deep Interview state projection for resume or prompt budgeting.",
		promptSnippet: "Read compact Deep Interview state when resuming or summarizing",
		parameters: readCompactSchema,
		execute: async (_id, params: ReadCompactInput, _signal, _onUpdate, ctx) => {
			const result = await readDeepInterviewStateCompact(ctx.cwd, sessionId(ctx), params.lastN);
			return textResult("deep-interview compact state", result);
		},
	});
	pi.registerTool({
		name: "deep_interview_closure_check",
		label: "Deep Interview Closure Check",
		description: "Run the Deep Interview closure and acceptance guard.",
		promptSnippet: "Run closure-check before crystallizing a Deep Interview spec",
		parameters: Type.Object({}),
		execute: async (_id, _params, _signal, _onUpdate, ctx) => {
			const result = await runClosureCheckForSession(ctx.cwd, sessionId(ctx));
			return textResult(result.ok ? "deep-interview closure passed" : "deep-interview closure blocked", result);
		},
	});
	pi.registerTool({
		name: "deep_interview_restate_goal",
		label: "Deep Interview Restate Goal",
		description: "Record the one-sentence restated goal confirmation or adjustment.",
		promptSnippet: "Confirm the Deep Interview one-sentence goal before write-spec",
		parameters: restateGoalSchema,
		execute: async (_id, params: RestateGoalInput, _signal, _onUpdate, ctx) => {
			const result = await restateGoalGate(
				ctx.cwd,
				{
					restatedGoal: params.restatedGoal,
					confirm: params.confirm as "Yes" | "Adjust" | "Missing",
					adjustment: params.adjustment,
				},
				sessionId(ctx),
			);
			return textResult(
				result.ok ? "deep-interview goal confirmed" : "deep-interview goal needs adjustment",
				result,
			);
		},
	});
	pi.registerTool({
		name: "deep_interview_write_spec",
		label: "Deep Interview Write Spec",
		description: "Persist a finalized Deep Interview spec and optionally hand off to ralplan, ultragoal, or team.",
		promptSnippet: "Persist finalized Deep Interview specs only after closure and restate gates pass",
		parameters: writeSpecSchema,
		execute: async (_id, params: WriteSpecInput, _signal, _onUpdate, ctx) => executeWriteSpec(params, ctx),
	});
}
