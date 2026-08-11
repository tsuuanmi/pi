import { workflowStatePath } from "#workflows/session/session-layout";
import { normalizeDeepInterviewEnvelope } from "#workflows/skills/deep-interview/envelope";
import { deriveDeepInterviewHud } from "#workflows/skills/deep-interview/hud";
import { answerHash, deriveRoundKey, questionHash } from "#workflows/skills/deep-interview/identity";
import type {
	DeepInterviewOrchestrationState,
	DeepInterviewPlannedQuestion,
	DeepInterviewRoundRecord,
	DeepInterviewStateEnvelope,
} from "#workflows/skills/deep-interview/types";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import { readWorkflowState, replaceWorkflowState } from "#workflows/state/workflow-state";

export function readRounds(envelope: DeepInterviewStateEnvelope): DeepInterviewRoundRecord[] {
	const rounds = envelope.state?.rounds;
	if (!Array.isArray(rounds)) throw new Error("deep-interview state.rounds is required");
	return rounds as DeepInterviewRoundRecord[];
}

export function readInterviewId(envelope: DeepInterviewStateEnvelope): string {
	const interviewId = envelope.state?.interview_id;
	if (typeof interviewId !== "string" || interviewId.trim() !== interviewId || !interviewId) {
		throw new Error("deep-interview state.interview_id is required");
	}
	return interviewId;
}

function validateRoundIdentity(envelope: DeepInterviewStateEnvelope): void {
	const interviewId = readInterviewId(envelope);
	for (const round of readRounds(envelope)) {
		if (!round.question_id || !round.question_text) {
			throw new Error(`deep-interview round ${round.round} requires question identity and text`);
		}
		const expectedKey = deriveRoundKey(interviewId, {
			round_id: round.round_id,
			round: round.round,
			questionId: round.question_id,
		});
		if (round.round_key !== expectedKey) {
			throw new Error(`deep-interview round ${round.round} has a mismatched round key`);
		}
		if (round.question_hash !== questionHash(round.question_text)) {
			throw new Error(`deep-interview round ${round.round} has a mismatched question hash`);
		}
		if (!round.selected_options?.length && !round.custom_input) {
			throw new Error(`deep-interview round ${round.round} has no answer content`);
		}
		if (round.answer_hash !== answerHash(round.selected_options, round.custom_input)) {
			throw new Error(`deep-interview round ${round.round} has a mismatched answer hash`);
		}
	}
}

export function plannedQuestionOf(envelope: DeepInterviewStateEnvelope): DeepInterviewPlannedQuestion | undefined {
	const orchestration = envelope.state?.orchestration as DeepInterviewOrchestrationState | undefined;
	return orchestration?.next_question;
}

export function withOrchestration(
	envelope: DeepInterviewStateEnvelope,
	orchestration: DeepInterviewOrchestrationState,
): DeepInterviewStateEnvelope {
	if (!envelope.state) throw new Error("deep-interview envelope.state is required");
	return { ...envelope, state: { ...envelope.state, orchestration } };
}

export async function readDeepInterviewEnvelope(cwd: string, sessionId: string): Promise<DeepInterviewStateEnvelope> {
	const raw = await readWorkflowState(cwd, "deep-interview", { sessionId });
	if (!raw) throw new Error("deep-interview workflow is not initialized");
	const state = raw.state;
	if (!state || typeof state !== "object" || Array.isArray(state)) {
		throw new Error("deep-interview canonical state requires a state object");
	}
	const canonical = state as Record<string, unknown>;
	if (!Array.isArray(canonical.rounds) || !Array.isArray(canonical.established_facts)) {
		throw new Error("deep-interview canonical state requires rounds and established_facts arrays");
	}
	const envelope = normalizeDeepInterviewEnvelope(raw);
	if (envelope.active !== true) throw new Error("deep-interview state is not active");
	if (
		typeof envelope.current_phase !== "string" ||
		envelope.current_phase.trim() !== envelope.current_phase ||
		!envelope.current_phase
	) {
		throw new Error("deep-interview current_phase is required");
	}
	if (
		typeof envelope.threshold !== "number" ||
		!Number.isFinite(envelope.threshold) ||
		envelope.threshold < 0 ||
		envelope.threshold > 1
	) {
		throw new Error("deep-interview threshold is required");
	}
	validateRoundIdentity(envelope);
	return envelope;
}

export async function persistDeepInterviewEnvelope(
	cwd: string,
	envelope: DeepInterviewStateEnvelope,
	command: string,
	sessionId: string,
): Promise<void> {
	if (!envelope.state || !Array.isArray(envelope.state.rounds) || !Array.isArray(envelope.state.established_facts)) {
		throw new Error("deep-interview canonical state requires rounds and established_facts arrays");
	}
	const normalized = normalizeDeepInterviewEnvelope(envelope);
	if (
		normalized.active !== true ||
		typeof normalized.current_phase !== "string" ||
		normalized.current_phase.trim() !== normalized.current_phase ||
		!normalized.current_phase ||
		typeof normalized.threshold !== "number" ||
		!Number.isFinite(normalized.threshold) ||
		normalized.threshold < 0 ||
		normalized.threshold > 1
	) {
		throw new Error("deep-interview persistence requires active canonical state");
	}
	validateRoundIdentity(normalized);
	const state = await replaceWorkflowState(cwd, "deep-interview", normalized, command, { sessionId });
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
