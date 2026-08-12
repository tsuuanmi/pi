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
	return envelope.state.rounds;
}

export function readInterviewId(envelope: DeepInterviewStateEnvelope): string {
	return envelope.state.interview_id;
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
	return envelope.state.orchestration?.next_question;
}

export function withOrchestration(
	envelope: DeepInterviewStateEnvelope,
	orchestration: DeepInterviewOrchestrationState,
): DeepInterviewStateEnvelope {
	return { ...envelope, state: { ...envelope.state, orchestration } };
}

export async function readDeepInterviewEnvelope(cwd: string, sessionId: string): Promise<DeepInterviewStateEnvelope> {
	const raw = await readWorkflowState(cwd, "deep-interview", { sessionId });
	if (!raw) throw new Error("deep-interview workflow is not initialized");
	const envelope = normalizeDeepInterviewEnvelope(raw);
	if (!envelope.active) throw new Error("deep-interview state is not active");
	validateRoundIdentity(envelope);
	return envelope;
}

export async function persistDeepInterviewEnvelope(
	cwd: string,
	envelope: DeepInterviewStateEnvelope,
	command: string,
	sessionId: string,
): Promise<void> {
	const normalized = normalizeDeepInterviewEnvelope(envelope);
	if (!normalized.active) throw new Error("deep-interview persistence requires active canonical state");
	validateRoundIdentity(normalized);
	await replaceWorkflowState(cwd, "deep-interview", normalized, command, { sessionId });
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "deep-interview",
			active: normalized.active,
			phase: normalized.current_phase,
			state_path: workflowStatePath(cwd, "deep-interview", sessionId),
			hud: deriveDeepInterviewHud(normalized, { updatedAt: new Date().toISOString() }),
		},
		{ sessionId },
	);
}
