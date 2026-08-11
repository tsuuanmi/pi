import { createHash } from "node:crypto";

function hashContent(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function questionHash(questionText: string): string {
	return hashContent(questionText);
}

export function answerHash(selectedOptions: string[] | undefined, customInput: string | undefined): string {
	return hashContent(JSON.stringify({ selected: selectedOptions ?? [], custom: customInput ?? null }));
}

export function deriveRoundKey(
	interviewId: string,
	input: { round_id?: string; round: number; questionId: string },
): string {
	if (!interviewId || interviewId.trim() !== interviewId || interviewId.length === 0) {
		throw new Error("deep-interview round requires a non-empty interview id");
	}
	if (input.round_id !== undefined) {
		if (!input.round_id || input.round_id.trim() !== input.round_id) {
			throw new Error("deep-interview round_id must be a non-empty, trimmed string");
		}
		return `${interviewId}::rid:${input.round_id}`;
	}
	if (!input.questionId || input.questionId.trim() !== input.questionId) {
		throw new Error("deep-interview round requires a non-empty question id");
	}
	return `${interviewId}::r:${input.round}::q:${input.questionId}`;
}
