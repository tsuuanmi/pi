import { workflowStatePath } from "#workflows/session/session-layout";
import { mergeDeepInterviewEnvelope } from "#workflows/skills/deep-interview/envelope";
import { answerHash, deriveRoundKey, questionHash } from "#workflows/skills/deep-interview/identity";
import {
	persistDeepInterviewEnvelope,
	plannedQuestionOf,
	readDeepInterviewEnvelope,
	readInterviewId,
	readRounds,
} from "#workflows/skills/deep-interview/store";
import { validateDeepInterviewScoredTransition } from "#workflows/skills/deep-interview/transitions";
import type {
	AppendOrMergeAction,
	AppendOrMergeResult,
	DeepInterviewAnswerInput,
	DeepInterviewOrchestrationState,
	DeepInterviewRoundRecord,
	DeepInterviewScoringInput,
} from "#workflows/skills/deep-interview/types";

function buildAnswerShell(
	interviewId: string,
	input: DeepInterviewAnswerInput,
	now = new Date().toISOString(),
): DeepInterviewRoundRecord {
	if (!Number.isInteger(input.round) || input.round < 1)
		throw new Error("deep-interview answer round must be positive");
	if (!input.questionId || input.questionId.trim() !== input.questionId) {
		throw new Error("deep-interview answer questionId must be a non-empty, trimmed string");
	}
	if (!input.questionText || input.questionText.trim() !== input.questionText) {
		throw new Error("deep-interview answer questionText must be a non-empty, trimmed string");
	}
	if (input.selectedOptions?.some((option) => !option || option.trim() !== option)) {
		throw new Error("deep-interview selected options must be non-empty, trimmed strings");
	}
	if (input.customInput !== undefined && input.customInput.trim() !== input.customInput) {
		throw new Error("deep-interview custom input must be trimmed");
	}
	if (!input.selectedOptions?.length && !input.customInput) {
		throw new Error("deep-interview answer requires selectedOptions or customInput");
	}
	return {
		round_key: deriveRoundKey(interviewId, input),
		round_id: input.round_id,
		round: input.round,
		question_id: input.questionId,
		question_text: input.questionText,
		question_hash: questionHash(input.questionText),
		answer_hash: answerHash(input.selectedOptions, input.customInput),
		selected_options: input.selectedOptions,
		custom_input: input.customInput,
		component: input.component,
		dimension: input.dimension,
		ambiguity_at_ask: input.ambiguity,
		lifecycle: "answered",
		answered_at: now,
	};
}

function appendOrMergeRound(
	rounds: readonly DeepInterviewRoundRecord[],
	shell: DeepInterviewRoundRecord,
): { rounds: DeepInterviewRoundRecord[]; action: AppendOrMergeAction; record: DeepInterviewRoundRecord } {
	const next = [...rounds];
	const index = next.findIndex((round) => round.round_key === shell.round_key);
	if (index < 0) return { rounds: [...next, shell], action: "created", record: shell };
	const existing = next[index];
	if (existing.question_hash === shell.question_hash && existing.answer_hash === shell.answer_hash) {
		return { rounds: next, action: "noop", record: existing };
	}
	next[index] = shell;
	return { rounds: next, action: "replaced", record: shell };
}

function enrichRoundWithScoring(
	interviewId: string,
	rounds: readonly DeepInterviewRoundRecord[],
	input: DeepInterviewScoringInput,
	now = new Date().toISOString(),
): { rounds: DeepInterviewRoundRecord[]; record: DeepInterviewRoundRecord } {
	if (!Number.isFinite(input.ambiguity) || input.ambiguity < 0 || input.ambiguity > 1) {
		throw new Error("deep-interview ambiguity must be between 0 and 1");
	}
	const scoreEntries = Object.entries(input.scores);
	if (
		scoreEntries.length === 0 ||
		scoreEntries.some(
			([dimension, score]) =>
				!dimension || dimension.trim() !== dimension || !Number.isFinite(score) || score < 0 || score > 1,
		)
	) {
		throw new Error("deep-interview scores must map trimmed dimensions to values between 0 and 1");
	}
	const roundKey = deriveRoundKey(interviewId, input);
	const next = [...rounds];
	const index = next.findIndex((round) => round.round_key === roundKey);
	if (index < 0) throw new Error(`deep-interview scoring requires an answered round: ${roundKey}`);
	const answered = next[index];
	if (!answered.question_hash || !answered.answer_hash) {
		throw new Error(`deep-interview scoring requires a complete answer shell: ${roundKey}`);
	}
	const merged: DeepInterviewRoundRecord = {
		...next[index],
		lifecycle: "scored",
		scored_at: now,
		scores: input.scores,
		ambiguity: input.ambiguity,
		triggers: input.triggers,
	};
	next[index] = merged;
	return { rounds: next, record: merged };
}

function latestPriorScoredRound(
	rounds: readonly DeepInterviewRoundRecord[],
	currentKey: string,
	currentRound: number,
): DeepInterviewRoundRecord | undefined {
	if (!Number.isFinite(currentRound)) return undefined;
	let prior: DeepInterviewRoundRecord | undefined;
	for (const candidate of rounds) {
		if (candidate.lifecycle !== "scored") continue;
		if (candidate.round_key === currentKey) continue;
		if (!Number.isFinite(candidate.round)) continue;
		if (!(candidate.round < currentRound)) continue;
		if (prior === undefined || candidate.round > prior.round) prior = candidate;
	}
	return prior;
}

export async function appendOrMergeDeepInterviewRound(
	cwd: string,
	input: DeepInterviewAnswerInput,
	sessionId: string,
): Promise<AppendOrMergeResult> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const pending = plannedQuestionOf(envelope);
	const interviewId = readInterviewId(envelope);
	const roundKey = deriveRoundKey(interviewId, input);
	const existingRound = readRounds(envelope).some((round) => round.round_key === roundKey);
	if (!pending && !existingRound) throw new Error("deep-interview answer requires a planned question");
	if (
		pending &&
		(pending.round !== input.round ||
			pending.question_id !== input.questionId ||
			pending.question_text !== input.questionText)
	) {
		throw new Error("deep-interview answer does not match the planned question");
	}
	if (
		input.topology !== undefined &&
		(!input.topology || typeof input.topology !== "object" || Array.isArray(input.topology))
	) {
		throw new Error("deep-interview topology must be an object");
	}
	const shell = buildAnswerShell(interviewId, input);
	const result = appendOrMergeRound(readRounds(envelope), shell);
	if (result.action !== "noop") {
		const inner = envelope.state as Record<string, unknown>;
		const existing = inner.orchestration as DeepInterviewOrchestrationState | undefined;
		if (!existing) throw new Error("deep-interview answer requires orchestration state");
		const next = mergeDeepInterviewEnvelope(envelope, {
			state: {
				interview_id: interviewId,
				rounds: result.rounds,
				...(input.topology !== undefined ? { topology: input.topology } : {}),
				orchestration: {
					status: "pending_scoring",
					next_dimension: input.dimension,
					question_plan: existing.question_plan,
					last_answered_question_id: input.questionId,
				},
			},
		});
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview record-answer", sessionId);
	}
	return {
		action: result.action,
		record: result.record,
		statePath: workflowStatePath(cwd, "deep-interview", sessionId),
	};
}

export async function enrichDeepInterviewRoundScoring(
	cwd: string,
	input: DeepInterviewScoringInput,
	sessionId: string,
): Promise<{ record: DeepInterviewRoundRecord; statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const interviewId = readInterviewId(envelope);
	const rounds = readRounds(envelope);
	const { rounds: nextRounds, record } = enrichRoundWithScoring(interviewId, rounds, input);
	const validation = validateDeepInterviewScoredTransition(
		latestPriorScoredRound(rounds, record.round_key, record.round),
		record,
	);
	if (!validation.ok) {
		throw new Error(
			`deep-interview scored transition for round ${record.round} is invalid and was refused: ${validation.violations.join("; ")}`,
		);
	}
	const state = envelope.state as Record<string, unknown>;
	const existing = state.orchestration as DeepInterviewOrchestrationState | undefined;
	if (!existing) throw new Error("deep-interview scoring requires orchestration state");
	const next = mergeDeepInterviewEnvelope(envelope, {
		state: {
			rounds: nextRounds,
			current_ambiguity: input.ambiguity,
			...(input.metadata ?? {}),
			orchestration: {
				status: "interviewing",
				next_dimension: record.dimension,
				question_plan: existing.question_plan,
				last_answered_question_id: existing.last_answered_question_id,
				last_scored_question_id: record.question_id,
			},
		},
	});
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview score-round", sessionId);
	return { record, statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}
