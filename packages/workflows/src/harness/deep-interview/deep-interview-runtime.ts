import { deriveDeepInterviewHud } from "#workflows/harness/deep-interview/deep-interview-hud";
import {
	answerHash,
	type DeepInterviewAdvisoryMetadata,
	type DeepInterviewCompactState,
	type DeepInterviewEstablishedFact,
	type DeepInterviewOrchestrationState,
	type DeepInterviewPlannedQuestion,
	type DeepInterviewRoundRecord,
	type DeepInterviewStateEnvelope,
	type DeepInterviewTriggerMetadata,
	deriveRoundKey,
	mergeDeepInterviewEnvelope,
	normalizeDeepInterviewEnvelope,
	questionHash,
	validateDeepInterviewScoredTransition,
} from "#workflows/harness/deep-interview/deep-interview-state";
import { projectCompactStateFor } from "#workflows/harness/shared/compaction/compaction";
import { workflowStatePath } from "#workflows/harness/shared/session/session-layout";
import { syncWorkflowActiveState } from "#workflows/harness/shared/state/active-state";
import { readWorkflowState, replaceWorkflowState } from "#workflows/harness/shared/state/workflow-state";

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
	topology?: unknown;
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
	/** Advisory methodology counters merged safely into `state` (never clobbers rounds). */
	metadata?: DeepInterviewAdvisoryMetadata;
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

async function readDeepInterviewEnvelope(cwd: string, sessionId: string): Promise<DeepInterviewStateEnvelope> {
	return normalizeDeepInterviewEnvelope(await readWorkflowState(cwd, "deep-interview", { sessionId }));
}

async function persistDeepInterviewEnvelope(
	cwd: string,
	envelope: DeepInterviewStateEnvelope,
	command: string,
	sessionId: string,
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
		{ sessionId },
	);
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "deep-interview",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "deep-interview", sessionId),
			hud: deriveDeepInterviewHud(state, { phase: state.current_phase }),
		},
		{ sessionId },
	);
}

export async function planDeepInterviewQuestion(
	cwd: string,
	input: DeepInterviewQuestionPlanInput,
	sessionId: string,
): Promise<{ question: DeepInterviewPlannedQuestion; statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
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
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview plan-question", sessionId);
	return { question, statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}

export async function appendOrMergeDeepInterviewRound(
	cwd: string,
	input: DeepInterviewAnswerInput,
	sessionId: string,
): Promise<AppendOrMergeResult> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
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
					...(input.topology !== undefined ? { topology: input.topology } : {}),
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
			...(input.metadata ?? {}),
			orchestration: {
				status: "interviewing",
				next_dimension: record.dimension,
				question_plan: existing?.question_plan ?? [],
				last_answered_question_id: existing?.last_answered_question_id,
				last_scored_question_id: record.question_id,
			},
		},
	});
	await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview score-round", sessionId);
	return { record, statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}

export async function finalizeDeepInterviewSpecState(
	cwd: string,
	input: { slug: string; path: string; sha256: string; handoff?: string },
	sessionId: string,
): Promise<{ statePath: string }> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const next = mergeDeepInterviewEnvelope(envelope, {
		active: input.handoff !== "stop",
		current_phase: input.handoff && input.handoff !== "stop" ? "handoff" : "complete",
		spec_slug: input.slug,
		spec_path: input.path,
		spec_sha256: input.sha256,
		handoff: input.handoff,
	});
	const state = await replaceWorkflowState(cwd, "deep-interview", next, "pi deep-interview write-spec", { sessionId });
	// When handing off to another workflow, skip the active-state sync here —
	// the caller will use `applyHandoffToActiveState` to demote deep-interview
	// and promote the target atomically in a single write. For "stop" (or no
	// handoff), sync directly since there is no target to promote.
	if (!input.handoff || input.handoff === "stop") {
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "deep-interview",
				active: input.handoff ? false : state.active,
				phase: state.current_phase,
				state_path: workflowStatePath(cwd, "deep-interview", sessionId),
				hud: deriveDeepInterviewHud(state, {
					phase: state.current_phase,
					specStatus: "persisted",
				}),
			},
			{ sessionId },
		);
	}
	return { statePath: workflowStatePath(cwd, "deep-interview", sessionId) };
}

export async function runClosureCheckForSession(cwd: string, sessionId: string): Promise<ClosureResult> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	return runClosureAcceptanceGuard(envelope);
}

export async function readDeepInterviewStateCompact(cwd: string, sessionId: string, lastN?: number) {
	return {
		state: projectCompactStateFor<DeepInterviewCompactState>(
			"deep-interview",
			await readWorkflowState(cwd, "deep-interview", { sessionId }),
			{ lastN },
		),
		statePath: workflowStatePath(cwd, "deep-interview", sessionId),
	};
}

// ---------------------------------------------------------------------------
// Closure/Acceptance Guard + Restate-Goal Gate (Step 4)
// ---------------------------------------------------------------------------

export interface ClosureResult {
	ok: boolean;
	gaps: string[];
}

/**
 * Closure acceptance guard for deep-interview.
 *
 * For each active (non-deferred) topology component, check the dimensions
 * {goal, constraints, criteria} (+ context when brownfield). A dimension is
 * covered if either (i) a matching established_facts entry exists, or (ii) a
 * scored round has a finite scores[dimension] >= 0.0. An unresolved or disputed
 * trigger on a material path blocks closure regardless of coverage.
 */
export function runClosureAcceptanceGuard(envelope: DeepInterviewStateEnvelope): ClosureResult {
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	const established: DeepInterviewEstablishedFact[] = Array.isArray(inner.established_facts)
		? (inner.established_facts as DeepInterviewEstablishedFact[])
		: [];
	const rounds: DeepInterviewRoundRecord[] = Array.isArray(inner.rounds)
		? (inner.rounds as DeepInterviewRoundRecord[])
		: [];
	const scoredRounds = rounds.filter((r) => r.lifecycle === "scored");

	// Check for unresolved/disputed triggers on material paths
	const unresolvedTriggers: DeepInterviewTriggerMetadata[] = [];
	for (const round of scoredRounds) {
		for (const trigger of round.triggers ?? []) {
			if (trigger.status === "unresolved" || trigger.status === "disputed") {
				unresolvedTriggers.push(trigger);
			}
		}
	}

	const gaps: string[] = [];

	// Unresolved/disputed triggers block closure
	for (const trigger of unresolvedTriggers) {
		gaps.push(
			`unresolved ${trigger.status} trigger ${trigger.kind} on ${trigger.component}/${trigger.dimension}: ${trigger.rationale ?? "no rationale"}`,
		);
	}

	// Get active (non-deferred) components
	const topology = inner.topology as
		| { components?: Array<{ status?: string; name?: string; dimensions?: string[] }> }
		| undefined;
	// Brownfield is determined by the init-state `type` field (the authoritative
	// signal). `codebase_context` is a fallback for legacy state lacking `type`.
	// `initial_context_summary` is NOT a brownfield signal: it is set whenever the
	// initial context was oversized, regardless of greenfield/brownfield.
	const isBrownfield = inner.type === "brownfield" || Boolean(inner.codebase_context);
	const dimensions = ["goal", "constraints", "criteria"];
	if (isBrownfield) dimensions.push("context");

	const activeComponents = topology?.components?.filter((c) => c.status !== "deferred") ?? [];

	if (activeComponents.length === 0) {
		// No active components — closure is trivially ok
		return { ok: gaps.length === 0, gaps };
	}

	for (const component of activeComponents) {
		const componentName = component.name ?? "unknown";
		for (const dimension of dimensions) {
			// Check (i): matching established_facts entry
			const hasFact = established.some(
				(f) =>
					!f.disputed &&
					(f.component === componentName || !f.component) &&
					(f.dimension === dimension || !f.dimension),
			);

			// Check (ii): scored round with finite score for this dimension
			const hasScoredRound = scoredRounds.some(
				(r) =>
					r.scores &&
					typeof r.scores[dimension] === "number" &&
					Number.isFinite(r.scores[dimension] as number) &&
					(r.scores[dimension] as number) >= 0 &&
					(r.component === componentName || !r.component),
			);

			if (!hasFact && !hasScoredRound) {
				gaps.push(`${componentName}/${dimension}: no established fact or scored round`);
			}
		}
	}

	return { ok: gaps.length === 0, gaps };
}

export interface RestateGoalInput {
	restatedGoal: string;
	confirm: "Yes" | "Adjust" | "Missing";
	adjustment?: string;
}

/**
 * Restate-goal gate: collapse agreed answers into a one-sentence goal covering
 * every active component. Confirm (Yes crystallizes), Adjust (re-score), or
 * Missing (add scope). Caps at two loops.
 */
export async function restateGoalGate(
	cwd: string,
	input: RestateGoalInput,
	sessionId: string,
): Promise<{ ok: boolean; restated_goal?: string; loops_remaining: number }> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	const inner = (envelope.state ?? {}) as Record<string, unknown>;

	const currentLoops = typeof inner._restate_loops === "number" ? inner._restate_loops : 0;
	if (currentLoops >= 2) {
		return { ok: false, loops_remaining: 0 };
	}

	if (input.confirm === "Yes") {
		const next = mergeDeepInterviewEnvelope(envelope, {
			restated_goal: input.restatedGoal,
		});
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview restate-goal", sessionId);
		return { ok: true, restated_goal: input.restatedGoal, loops_remaining: 2 - currentLoops - 1 };
	}

	if (input.confirm === "Adjust" || input.confirm === "Missing") {
		const closureOverrides = Array.isArray(envelope.closure_overrides) ? [...envelope.closure_overrides] : [];
		closureOverrides.push(`${input.confirm}: ${input.adjustment ?? input.restatedGoal}`);
		const next = mergeDeepInterviewEnvelope(envelope, {
			restated_goal: input.restatedGoal,
			closure_overrides: closureOverrides,
			state: { _restate_loops: currentLoops + 1 },
		});
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview restate-goal", sessionId);
		return { ok: false, restated_goal: input.restatedGoal, loops_remaining: 2 - currentLoops - 1 };
	}

	return { ok: false, loops_remaining: 2 - currentLoops };
}
