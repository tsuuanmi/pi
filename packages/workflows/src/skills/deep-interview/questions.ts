import { workflowStatePath } from "#workflows/session/session-layout";
import { mergeDeepInterviewEnvelope } from "#workflows/skills/deep-interview/envelope";
import {
	persistDeepInterviewEnvelope,
	readDeepInterviewEnvelope,
	readInterviewId,
	withOrchestration,
} from "#workflows/skills/deep-interview/store";
import type {
	DeepInterviewOrchestrationState,
	DeepInterviewPlannedQuestion,
	DeepInterviewQuestionPlanInput,
} from "#workflows/skills/deep-interview/types";

export async function planDeepInterviewQuestion(
	cwd: string,
	input: DeepInterviewQuestionPlanInput,
	sessionId: string,
): Promise<{ question: DeepInterviewPlannedQuestion; statePath: string }> {
	if (!Number.isInteger(input.round) || input.round < 1)
		throw new Error("deep-interview question round must be positive");
	if (!input.questionText || input.questionText.trim() !== input.questionText) {
		throw new Error("deep-interview question text must be a non-empty, trimmed string");
	}
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const interviewId = readInterviewId(envelope);
	if (!input.questionId || input.questionId.trim() !== input.questionId) {
		throw new Error("deep-interview question id must be a non-empty, trimmed string");
	}
	for (const [field, value] of [
		["component", input.component],
		["dimension", input.dimension],
		["rationale", input.rationale],
	] as const) {
		if (value !== undefined && (!value || value.trim() !== value)) {
			throw new Error(`deep-interview question ${field} must be a non-empty, trimmed string`);
		}
	}
	if (
		input.ambiguity !== undefined &&
		(!Number.isFinite(input.ambiguity) || input.ambiguity < 0 || input.ambiguity > 1)
	) {
		throw new Error("deep-interview question ambiguity must be between 0 and 1");
	}
	const question: DeepInterviewPlannedQuestion = {
		round: input.round,
		question_id: input.questionId,
		question_text: input.questionText,
		component: input.component,
		dimension: input.dimension,
		ambiguity_at_ask: input.ambiguity,
		rationale: input.rationale,
		planned_at: new Date().toISOString(),
	};
	const existing = envelope.state?.orchestration as DeepInterviewOrchestrationState | undefined;
	const questionPlan = existing ? [...existing.question_plan, question] : [question];
	const orchestrated = withOrchestration(envelope, {
		status: "waiting_for_answer",
		next_question: question,
		next_dimension: question.dimension,
		question_plan: questionPlan,
		waiting_since: question.planned_at,
	});
	const next = mergeDeepInterviewEnvelope(orchestrated, { state: { interview_id: interviewId } });
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview plan-question", sessionId);
	return { question, statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}
