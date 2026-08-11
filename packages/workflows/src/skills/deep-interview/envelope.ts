import type {
	DeepInterviewEstablishedFact,
	DeepInterviewOrchestrationState,
	DeepInterviewPlannedQuestion,
	DeepInterviewRoundRecord,
	DeepInterviewStateEnvelope,
} from "#workflows/skills/deep-interview/types";

const DISALLOWED_TOP_LEVEL_FIELDS = new Set([
	"rounds",
	"established_facts",
	"current_ambiguity",
	"topology",
	"ontology_snapshots",
	"auto_researched_rounds",
	"auto_answered_rounds",
	"architect_failures",
	"orchestration",
	"initial_idea",
	"initial_context_summary",
	"codebase_context",
	"challenge_modes_used",
	"interview_id",
	"type",
	"language",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseRecordArray(value: unknown, field: string): Record<string, unknown>[] {
	if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
		throw new Error(`deep-interview state.${field} must be an array of objects`);
	}
	return value.map((item) => ({ ...item }));
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
		throw new Error(`deep-interview ${field} must be a non-empty, trimmed string`);
	}
	return value;
}

function requireTimestamp(value: unknown, field: string): string {
	const timestamp = requireString(value, field);
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime()) || date.toISOString() !== timestamp) {
		throw new Error(`deep-interview ${field} must be a canonical ISO timestamp`);
	}
	return timestamp;
}

function parseTriggers(value: unknown, field: string): DeepInterviewRoundRecord["triggers"] {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((trigger) => !isRecord(trigger))) {
		throw new Error(`deep-interview ${field} must be an array of objects`);
	}
	return value.map((trigger, index) => {
		const triggerField = `${field}[${index}]`;
		if (!["A", "B", "C", "D"].includes(trigger.kind as string)) {
			throw new Error(`deep-interview ${triggerField}.kind is invalid`);
		}
		if (!["active", "disputed", "unresolved"].includes(trigger.status as string)) {
			throw new Error(`deep-interview ${triggerField}.status is invalid`);
		}
		for (const key of ["name", "component", "dimension", "rationale"] as const) {
			requireString(trigger[key], `${triggerField}.${key}`);
		}
		for (const key of ["priorAmbiguity", "newAmbiguity"] as const) {
			if (
				trigger[key] !== undefined &&
				(typeof trigger[key] !== "number" ||
					!Number.isFinite(trigger[key]) ||
					(trigger[key] as number) < 0 ||
					(trigger[key] as number) > 1)
			) {
				throw new Error(`deep-interview ${triggerField}.${key} must be between 0 and 1`);
			}
		}
		return trigger as unknown as NonNullable<DeepInterviewRoundRecord["triggers"]>[number];
	});
}

function parseRounds(value: unknown): DeepInterviewRoundRecord[] {
	return parseRecordArray(value, "rounds").map((round, index) => {
		const field = `state.rounds[${index}]`;
		if (!Number.isInteger(round.round) || (round.round as number) < 1) {
			throw new Error(`deep-interview ${field}.round must be a positive integer`);
		}
		if (round.lifecycle !== "answered" && round.lifecycle !== "pending_scoring" && round.lifecycle !== "scored") {
			throw new Error(`deep-interview ${field}.lifecycle is invalid`);
		}
		const questionHash = requireString(round.question_hash, `${field}.question_hash`);
		const answerHash = requireString(round.answer_hash, `${field}.answer_hash`);
		if (!/^[a-f0-9]{32}$/u.test(questionHash) || !/^[a-f0-9]{32}$/u.test(answerHash)) {
			throw new Error(`deep-interview ${field} hashes must be lowercase 32-character hex strings`);
		}
		if (round.selected_options !== undefined) {
			if (
				!Array.isArray(round.selected_options) ||
				round.selected_options.some((option) => typeof option !== "string" || !option || option.trim() !== option)
			) {
				throw new Error(`deep-interview ${field}.selected_options must contain trimmed strings`);
			}
		}
		const parsed = {
			...round,
			round_key: requireString(round.round_key, `${field}.round_key`),
			round_id: round.round_id === undefined ? undefined : requireString(round.round_id, `${field}.round_id`),
			round: round.round as number,
			question_id: requireString(round.question_id, `${field}.question_id`),
			question_text: requireString(round.question_text, `${field}.question_text`),
			question_hash: questionHash,
			answer_hash: answerHash,
			selected_options: round.selected_options as string[] | undefined,
			custom_input:
				round.custom_input === undefined ? undefined : requireString(round.custom_input, `${field}.custom_input`),
			component: round.component === undefined ? undefined : requireString(round.component, `${field}.component`),
			dimension: round.dimension === undefined ? undefined : requireString(round.dimension, `${field}.dimension`),
			triggers: parseTriggers(round.triggers, `${field}.triggers`),
			lifecycle: round.lifecycle,
			answered_at: requireTimestamp(round.answered_at, `${field}.answered_at`),
		} as DeepInterviewRoundRecord;
		if (parsed.lifecycle === "scored") {
			if (
				!isRecord(parsed.scores) ||
				Object.keys(parsed.scores).length === 0 ||
				Object.entries(parsed.scores).some(
					([dimension, score]) =>
						!dimension ||
						dimension.trim() !== dimension ||
						typeof score !== "number" ||
						!Number.isFinite(score) ||
						score < 0 ||
						score > 1,
				)
			) {
				throw new Error(`deep-interview ${field}.scores must map trimmed dimensions to values between 0 and 1`);
			}
			if (
				typeof parsed.ambiguity !== "number" ||
				!Number.isFinite(parsed.ambiguity) ||
				parsed.ambiguity < 0 ||
				parsed.ambiguity > 1
			) {
				throw new Error(`deep-interview ${field}.ambiguity must be between 0 and 1`);
			}
			requireTimestamp(parsed.scored_at, `${field}.scored_at`);
		}
		return parsed;
	});
}

function parseFacts(value: unknown): DeepInterviewEstablishedFact[] {
	return parseRecordArray(value, "established_facts").map((fact, index) => {
		const field = `state.established_facts[${index}]`;
		if (!Number.isInteger(fact.round) || (fact.round as number) < 1 || typeof fact.disputed !== "boolean") {
			throw new Error(`deep-interview ${field} has invalid round or disputed fields`);
		}
		return {
			id: requireString(fact.id, `${field}.id`),
			statement: requireString(fact.statement, `${field}.statement`),
			round: fact.round as number,
			component: fact.component === undefined ? undefined : requireString(fact.component, `${field}.component`),
			dimension: fact.dimension === undefined ? undefined : requireString(fact.dimension, `${field}.dimension`),
			evidence: fact.evidence === undefined ? undefined : requireString(fact.evidence, `${field}.evidence`),
			disputed: fact.disputed,
		};
	});
}

function parsePlannedQuestion(value: unknown, field: string): DeepInterviewPlannedQuestion {
	if (!isRecord(value)) throw new Error(`deep-interview ${field} must be an object`);
	if (!Number.isInteger(value.round) || (value.round as number) < 1) {
		throw new Error(`deep-interview ${field}.round must be a positive integer`);
	}
	const question: DeepInterviewPlannedQuestion = {
		round: value.round as number,
		question_id: requireString(value.question_id, `${field}.question_id`),
		question_text: requireString(value.question_text, `${field}.question_text`),
		planned_at: requireTimestamp(value.planned_at, `${field}.planned_at`),
	};
	for (const key of ["component", "dimension", "rationale"] as const) {
		if (value[key] !== undefined) question[key] = requireString(value[key], `${field}.${key}`);
	}
	if (value.ambiguity_at_ask !== undefined) {
		if (
			typeof value.ambiguity_at_ask !== "number" ||
			!Number.isFinite(value.ambiguity_at_ask) ||
			value.ambiguity_at_ask < 0 ||
			value.ambiguity_at_ask > 1
		) {
			throw new Error(`deep-interview ${field}.ambiguity_at_ask must be between 0 and 1`);
		}
		question.ambiguity_at_ask = value.ambiguity_at_ask;
	}
	return question;
}

function parseOrchestration(value: unknown): DeepInterviewOrchestrationState {
	if (!isRecord(value)) throw new Error("deep-interview state.orchestration must be an object");
	if (
		!["interviewing", "waiting_for_answer", "pending_scoring", "ready_to_finalize"].includes(value.status as string)
	) {
		throw new Error("deep-interview state.orchestration.status is invalid");
	}
	if (!Array.isArray(value.question_plan)) {
		throw new Error("deep-interview state.orchestration.question_plan must be an array");
	}
	const orchestration: DeepInterviewOrchestrationState = {
		status: value.status as DeepInterviewOrchestrationState["status"],
		question_plan: value.question_plan.map((question, index) =>
			parsePlannedQuestion(question, `state.orchestration.question_plan[${index}]`),
		),
	};
	if (value.next_question !== undefined) {
		orchestration.next_question = parsePlannedQuestion(value.next_question, "state.orchestration.next_question");
	}
	for (const key of ["next_dimension", "last_answered_question_id", "last_scored_question_id"] as const) {
		if (value[key] !== undefined) orchestration[key] = requireString(value[key], `state.orchestration.${key}`);
	}
	if (value.waiting_since !== undefined) {
		orchestration.waiting_since = requireTimestamp(value.waiting_since, "state.orchestration.waiting_since");
	}
	return orchestration;
}

function parseEnvelope(value: unknown, canonical: boolean): DeepInterviewStateEnvelope {
	if (!isRecord(value)) throw new Error("deep-interview envelope must be an object");
	const envelope = { ...value } as DeepInterviewStateEnvelope;
	for (const field of DISALLOWED_TOP_LEVEL_FIELDS) {
		if (Object.hasOwn(envelope, field)) {
			throw new Error(`deep-interview field must be nested under state: ${field}`);
		}
	}
	if (
		envelope.threshold !== undefined &&
		(typeof envelope.threshold !== "number" ||
			!Number.isFinite(envelope.threshold) ||
			envelope.threshold < 0 ||
			envelope.threshold > 1)
	) {
		throw new Error("deep-interview threshold must be between 0 and 1");
	}
	if (envelope.state === undefined) {
		if (canonical) throw new Error("deep-interview envelope.state is required");
		return envelope;
	}
	if (!isRecord(envelope.state)) throw new Error("deep-interview envelope.state must be an object");
	const state = { ...envelope.state };
	if (Object.hasOwn(state, "rounds")) state.rounds = parseRounds(state.rounds);
	else if (canonical) throw new Error("deep-interview state.rounds is required");
	if (Object.hasOwn(state, "established_facts")) state.established_facts = parseFacts(state.established_facts);
	else if (canonical) throw new Error("deep-interview state.established_facts is required");
	if (state.orchestration !== undefined) state.orchestration = parseOrchestration(state.orchestration);
	return { ...envelope, state };
}

export function normalizeDeepInterviewEnvelope(value: unknown): DeepInterviewStateEnvelope {
	return parseEnvelope(value, true);
}

export function mergeDeepInterviewEnvelope(existing: unknown, incoming: unknown): DeepInterviewStateEnvelope {
	const prior = normalizeDeepInterviewEnvelope(existing);
	const patch = parseEnvelope(incoming, false);
	const merged: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(prior)) if (key !== "state") merged[key] = value;
	for (const [key, value] of Object.entries(patch)) {
		if (key === "state") continue;
		if (value === null) delete merged[key];
		else merged[key] = value;
	}

	const state: Record<string, unknown> = { ...(prior.state as Record<string, unknown>) };
	if (patch.state !== undefined) {
		for (const [key, value] of Object.entries(patch.state)) {
			if (value === null) delete state[key];
			else state[key] = value;
		}
	}
	merged.state = state;
	return normalizeDeepInterviewEnvelope(merged);
}
