import { syncWorkflowActiveState } from "./active-state.ts";
import { deriveDeepInterviewHud } from "./deep-interview-hud.ts";
import {
	answerHash,
	type DeepInterviewOrchestrationState,
	type DeepInterviewPlannedQuestion,
	type DeepInterviewRoundRecord,
	type DeepInterviewStateEnvelope,
	deriveRoundKey,
	mergeDeepInterviewEnvelope,
	normalizeDeepInterviewEnvelope,
	projectCompactState,
	questionHash,
	validateDeepInterviewScoredTransition,
} from "./deep-interview-state.ts";
import { workflowStatePath } from "./paths.ts";
import { readWorkflowState, replaceWorkflowState } from "./workflow-state.ts";

export interface DeepInterviewAnswerInput {
	interviewId?: string;
	round?: number;
	round_id?: string;
	questionId?: string;
	questionText?: string;
	component?: string;
	dimension?: string;
	ambiguity?: number;
	selectedOptions?: string[];
	customInput?: string;
}

export interface DeepInterviewQuestionPlanInput {
	round: number;
	questionId?: string;
	questionText: string;
	component?: string;
	dimension?: string;
	ambiguity?: number;
	rationale?: string;
}

export interface DeepInterviewScoringInput {
	interviewId?: string;
	round: number;
	round_id?: string;
	questionId?: string;
	scores: Record<string, number>;
	ambiguity: number;
	triggers?: DeepInterviewRoundRecord["triggers"];
}

export type AppendOrMergeAction = "created" | "noop" | "replaced";

export interface AppendOrMergeResult {
	action: AppendOrMergeAction;
	record: DeepInterviewRoundRecord;
	statePath: string;
}

function readRounds(envelope: DeepInterviewStateEnvelope): DeepInterviewRoundRecord[] {
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	return Array.isArray(inner.rounds) ? (inner.rounds as DeepInterviewRoundRecord[]) : [];
}

function interviewIdOf(envelope: DeepInterviewStateEnvelope): string | undefined {
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	return typeof inner.interview_id === "string" ? inner.interview_id : undefined;
}

function plannedQuestionOf(envelope: DeepInterviewStateEnvelope): DeepInterviewPlannedQuestion | undefined {
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	const orchestration = inner.orchestration as DeepInterviewOrchestrationState | undefined;
	return orchestration?.next_question;
}

function withOrchestration(
	envelope: DeepInterviewStateEnvelope,
	orchestration: DeepInterviewOrchestrationState,
): DeepInterviewStateEnvelope {
	const inner = { ...((envelope.state ?? {}) as Record<string, unknown>), orchestration };
	return { ...envelope, state: inner };
}

function buildAnswerShell(input: DeepInterviewAnswerInput, now = new Date().toISOString()): DeepInterviewRoundRecord {
	if (input.round === undefined)
		throw new Error("round is required when no planned deep-interview question is pending");
	if (!input.questionText)
		throw new Error("questionText is required when no planned deep-interview question is pending");
	return {
		round_key: deriveRoundKey(input.interviewId, { ...input, round: input.round }),
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
	rounds: readonly DeepInterviewRoundRecord[],
	input: DeepInterviewScoringInput,
	now = new Date().toISOString(),
): { rounds: DeepInterviewRoundRecord[]; record: DeepInterviewRoundRecord } {
	const roundKey = deriveRoundKey(input.interviewId, input);
	const next = [...rounds];
	const index = next.findIndex((round) => round.round_key === roundKey);
	if (index < 0) {
		const created: DeepInterviewRoundRecord = {
			round_key: roundKey,
			round_id: input.round_id,
			round: input.round,
			question_id: input.questionId,
			question_hash: "",
			answer_hash: "",
			lifecycle: "scored",
			answered_at: now,
			scored_at: now,
			scores: input.scores,
			ambiguity: input.ambiguity,
			triggers: input.triggers,
		};
		next.push(created);
		return { rounds: next, record: created };
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

async function readDeepInterviewEnvelope(cwd: string): Promise<DeepInterviewStateEnvelope> {
	return normalizeDeepInterviewEnvelope(await readWorkflowState(cwd, "deep-interview"));
}

async function persistDeepInterviewEnvelope(
	cwd: string,
	envelope: DeepInterviewStateEnvelope,
	command: string,
): Promise<void> {
	const normalized = normalizeDeepInterviewEnvelope(envelope);
	const state = await replaceWorkflowState(
		cwd,
		"deep-interview",
		{
			...normalized,
			active: normalized.active !== false,
			current_phase: typeof normalized.current_phase === "string" ? normalized.current_phase : "interviewing",
		},
		command,
	);
	await syncWorkflowActiveState(cwd, {
		skill: "deep-interview",
		active: state.active,
		phase: state.current_phase,
		state_path: workflowStatePath(cwd, "deep-interview"),
		hud: deriveDeepInterviewHud(state, { phase: state.current_phase }),
	});
}

export async function planDeepInterviewQuestion(
	cwd: string,
	input: DeepInterviewQuestionPlanInput,
): Promise<{ question: DeepInterviewPlannedQuestion; statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd);
	const question: DeepInterviewPlannedQuestion = {
		round: input.round,
		question_id: input.questionId ?? `q${input.round}`,
		question_text: input.questionText,
		component: input.component,
		dimension: input.dimension,
		ambiguity_at_ask: input.ambiguity,
		rationale: input.rationale,
		planned_at: new Date().toISOString(),
	};
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	const existing = inner.orchestration as DeepInterviewOrchestrationState | undefined;
	const questionPlan = [...(existing?.question_plan ?? []), question];
	const next = withOrchestration(envelope, {
		status: "waiting_for_answer",
		next_question: question,
		next_dimension: question.dimension,
		question_plan: questionPlan,
		waiting_since: question.planned_at,
	});
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview plan-question");
	return { question, statePath: workflowStatePath(cwd, "deep-interview") };
}

export async function appendOrMergeDeepInterviewRound(
	cwd: string,
	input: DeepInterviewAnswerInput,
): Promise<AppendOrMergeResult> {
	const envelope = await readDeepInterviewEnvelope(cwd);
	const pending = plannedQuestionOf(envelope);
	const interviewId = input.interviewId ?? interviewIdOf(envelope);
	const effectiveInput: DeepInterviewAnswerInput = {
		...input,
		interviewId,
		round: input.round ?? pending?.round,
		questionId: input.questionId ?? pending?.question_id,
		questionText: input.questionText ?? pending?.question_text,
		component: input.component ?? pending?.component,
		dimension: input.dimension ?? pending?.dimension,
		ambiguity: input.ambiguity ?? pending?.ambiguity_at_ask,
	};
	const shell = buildAnswerShell(effectiveInput);
	const result = appendOrMergeRound(readRounds(envelope), shell);
	if (result.action !== "noop") {
		const inner = (envelope.state ?? {}) as Record<string, unknown>;
		const existing = inner.orchestration as DeepInterviewOrchestrationState | undefined;
		const next = mergeDeepInterviewEnvelope(
			envelope,
			{
				state: {
					rounds: result.rounds,
					orchestration: {
						status: "pending_scoring",
						next_dimension: effectiveInput.dimension,
						question_plan: existing?.question_plan ?? [],
						last_answered_question_id: effectiveInput.questionId,
					},
				},
			},
			{ replace: false },
		);
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview record-answer");
	}
	return { action: result.action, record: result.record, statePath: workflowStatePath(cwd, "deep-interview") };
}

export async function enrichDeepInterviewRoundScoring(
	cwd: string,
	input: DeepInterviewScoringInput,
): Promise<{ record: DeepInterviewRoundRecord; statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd);
	const interviewId = input.interviewId ?? interviewIdOf(envelope);
	const rounds = readRounds(envelope);
	const { rounds: nextRounds, record } = enrichRoundWithScoring(rounds, { ...input, interviewId });
	const validation = validateDeepInterviewScoredTransition(
		latestPriorScoredRound(rounds, record.round_key, record.round),
		record,
	);
	if (!validation.ok) {
		throw new Error(
			`deep-interview scored transition for round ${record.round} is invalid and was refused: ${validation.violations.join("; ")}`,
		);
	}
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	const existing = inner.orchestration as DeepInterviewOrchestrationState | undefined;
	const next = mergeDeepInterviewEnvelope(envelope, {
		state: {
			rounds: nextRounds,
			current_ambiguity: input.ambiguity,
			orchestration: {
				status: "interviewing",
				next_dimension: record.dimension,
				question_plan: existing?.question_plan ?? [],
				last_answered_question_id: existing?.last_answered_question_id,
				last_scored_question_id: record.question_id,
			},
		},
	});
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview score-round");
	return { record, statePath: workflowStatePath(cwd, "deep-interview") };
}

export async function finalizeDeepInterviewSpecState(
	cwd: string,
	input: { slug: string; path: string; sha256: string; handoff?: string },
): Promise<{ statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd);
	const next = mergeDeepInterviewEnvelope(envelope, {
		active: input.handoff !== "stop",
		current_phase: input.handoff && input.handoff !== "stop" ? "handoff" : "complete",
		spec_slug: input.slug,
		spec_path: input.path,
		spec_sha256: input.sha256,
		handoff: input.handoff,
	});
	const state = await replaceWorkflowState(cwd, "deep-interview", next, "pi deep-interview write-spec");
	await syncWorkflowActiveState(cwd, {
		skill: "deep-interview",
		active: input.handoff ? false : state.active,
		phase: state.current_phase,
		state_path: workflowStatePath(cwd, "deep-interview"),
		hud: deriveDeepInterviewHud(state, {
			phase: state.current_phase,
			specStatus: "persisted",
		}),
	});
	return { statePath: workflowStatePath(cwd, "deep-interview") };
}

export async function readDeepInterviewStateCompact(cwd: string, lastN?: number) {
	return {
		state: projectCompactState(await readWorkflowState(cwd, "deep-interview"), { lastN }),
		statePath: workflowStatePath(cwd, "deep-interview"),
	};
}
