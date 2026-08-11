import { handoffWorkflow } from "#workflows/handoff/handoff";
import { deepInterviewIndexPath, deepInterviewSpecPath } from "#workflows/session/session-layout";
import { restateGoalGate, runClosureCheckForSession } from "#workflows/skills/deep-interview/closure";
import { assertDeepInterviewHandoff } from "#workflows/skills/deep-interview/guards";
import { planDeepInterviewQuestion } from "#workflows/skills/deep-interview/questions";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
} from "#workflows/skills/deep-interview/rounds";
import {
	emptySchema,
	type PlanQuestionInput,
	planQuestionSchema,
	type RecordAnswerInput,
	type RecordScoringInput,
	type RestateGoalInput,
	recordAnswerSchema,
	recordScoringSchema,
	restateGoalSchema,
	type WriteSpecInput,
	writeSpecSchema,
} from "#workflows/skills/deep-interview/schemas";
import { assertDeepInterviewSpecReady, finalizeDeepInterviewSpecState } from "#workflows/skills/deep-interview/spec";
import { assertSafePathComponent } from "#workflows/state/state-schema";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "#workflows/state/state-writer";
import type { WorkflowContext } from "#workflows/tool/context";
import { workflowToolDetails } from "#workflows/tool/details";
import type { WorkflowToolHost } from "#workflows/tool/host";

function sessionId(ctx: WorkflowContext): string {
	return ctx.sessionManager.getSessionId();
}

function textResult(text: string, details: unknown) {
	return {
		content: [{ type: "text" as const, text }],
		details: workflowToolDetails(details as Record<string, unknown>),
	};
}

function requireRalplanRunId(value: string | undefined): string {
	const runId = value?.trim();
	if (!runId) throw new Error("deep-interview ralplan handoff requires runId");
	return runId;
}

async function executeWriteSpec(params: WriteSpecInput, ctx: WorkflowContext) {
	await assertDeepInterviewSpecReady(ctx.cwd, sessionId(ctx));
	const slug = params.slug.trim();
	assertSafePathComponent(slug, "slug");
	assertDeepInterviewHandoff(params.handoff);
	const handoff =
		params.handoff === "ralplan"
			? { target: params.handoff, runId: requireRalplanRunId(params.runId) }
			: { target: params.handoff };
	const content = await readFileOrLiteral(params.spec, ctx.cwd);
	const specPath = deepInterviewSpecPath(ctx.cwd, slug, sessionId(ctx));
	const result = await writeTextArtifact(specPath, content, { cwd: ctx.cwd });
	await appendJsonl(
		deepInterviewIndexPath(ctx.cwd, sessionId(ctx)),
		{ slug, path: result.path, sha256: result.sha256, created_at: result.createdAt },
		{ cwd: ctx.cwd },
	);
	const handoffTarget = handoff.target === "stop" ? undefined : handoff.target;
	if (handoffTarget === "ralplan" || handoffTarget === "team" || handoffTarget === "ultragoal") {
		await finalizeDeepInterviewSpecState(
			ctx.cwd,
			{ slug, path: result.path, sha256: result.sha256, handoff: handoffTarget },
			sessionId(ctx),
		);
		const calleePatch =
			handoff.target === "ralplan" ? { input: result.path, run_id: handoff.runId } : { input: result.path };
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
			{ slug, path: result.path, sha256: result.sha256, handoff: params.handoff },
			sessionId(ctx),
		);
	}
	return textResult(`deep-interview spec written: ${result.path}`, {
		slug,
		path: result.path,
		sha256: result.sha256,
		handoff: params.handoff,
	});
}

export function registerDeepInterviewTools(host: WorkflowToolHost): void {
	host.registerTool({
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
	host.registerTool({
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
	host.registerTool({
		name: "deep_interview_record_scoring",
		label: "Deep Interview Record Scoring",
		description: "Record scores, ambiguity, trigger metadata, and advisory counters for a Deep Interview round.",
		promptSnippet: "Record Deep Interview scoring after each answer",
		parameters: recordScoringSchema,
		execute: async (_id, params: RecordScoringInput, _signal, _onUpdate, ctx) => {
			const result = await enrichDeepInterviewRoundScoring(ctx.cwd, params, sessionId(ctx));
			return textResult("deep-interview scoring recorded", result);
		},
	});
	host.registerTool({
		name: "deep_interview_closure_check",
		label: "Deep Interview Closure Check",
		description: "Run the Deep Interview closure and acceptance guard.",
		promptSnippet: "Run closure-check before crystallizing a Deep Interview spec",
		parameters: emptySchema,
		execute: async (_id, _params, _signal, _onUpdate, ctx) => {
			const result = await runClosureCheckForSession(ctx.cwd, sessionId(ctx));
			return textResult(result.ok ? "deep-interview closure passed" : "deep-interview closure blocked", result);
		},
	});
	host.registerTool({
		name: "deep_interview_restate_goal",
		label: "Deep Interview Restate Goal",
		description: "Record the one-sentence restated goal confirmation or adjustment.",
		promptSnippet: "Confirm the Deep Interview one-sentence goal before write-spec",
		parameters: restateGoalSchema,
		execute: async (_id, params: RestateGoalInput, _signal, _onUpdate, ctx) => {
			const result = await restateGoalGate(ctx.cwd, params, sessionId(ctx));
			return textResult(
				result.ok ? "deep-interview goal confirmed" : "deep-interview goal needs adjustment",
				result,
			);
		},
	});
	host.registerTool({
		name: "deep_interview_write_spec",
		label: "Deep Interview Write Spec",
		description: "Persist a finalized Deep Interview spec and optionally hand off to ralplan, ultragoal, or team.",
		promptSnippet: "Persist finalized Deep Interview specs only after closure and restate gates pass",
		parameters: writeSpecSchema,
		execute: async (_id, params: WriteSpecInput, _signal, _onUpdate, ctx) => executeWriteSpec(params, ctx),
	});
}
