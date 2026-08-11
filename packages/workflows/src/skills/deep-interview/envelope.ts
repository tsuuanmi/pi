import type {
	DeepInterviewEstablishedFact,
	DeepInterviewOrchestrationState,
	DeepInterviewPlannedQuestion,
	DeepInterviewRoundRecord,
	DeepInterviewStateEnvelope,
	DeepInterviewTopology,
} from "#workflows/skills/deep-interview/types";

const DISALLOWED_TOP_LEVEL_FIELDS = new Set([
	"rounds",
	"established_facts",
	"current_ambiguity",
	"topology",
	"ontology_snapshots",
	"auto_researched_rounds",
	"auto_answered_rounds",
	"auto_answer_streak",
	"refined_rounds",
	"ambiguity_milestone",
	"lateral_reviews",
	"lateral_panel_failures",
	"architect_failures",
	"restate_loops",
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

function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
	const allowed = new Set(keys);
	const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
	if (unexpected.length > 0) {
		throw new Error(`deep-interview ${field} has unsupported fields: ${unexpected.join(", ")}`);
	}
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

function requireRatio(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
		throw new Error(`deep-interview ${field} must be between 0 and 1`);
	}
	return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
	if (!Number.isInteger(value) || (value as number) < 0) {
		throw new Error(`deep-interview ${field} must be a non-negative integer`);
	}
	return value as number;
}

function parseRoundNumbers(value: unknown, field: string): number[] {
	if (!Array.isArray(value)) throw new Error(`deep-interview ${field} must be an array`);
	return value.map((round, index) => {
		if (!Number.isInteger(round) || round < 1) {
			throw new Error(`deep-interview ${field}[${index}] must be a positive integer`);
		}
		return round;
	});
}

function parseTriggers(value: unknown, field: string): DeepInterviewRoundRecord["triggers"] {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((trigger) => !isRecord(trigger))) {
		throw new Error(`deep-interview ${field} must be an array of objects`);
	}
	return value.map((trigger, index) => {
		const triggerField = `${field}[${index}]`;
		assertOnlyKeys(
			trigger,
			[
				"kind",
				"name",
				"status",
				"component",
				"dimension",
				"priorAmbiguity",
				"newAmbiguity",
				"evidence",
				"contradictedFactId",
				"rationale",
			],
			triggerField,
		);
		if (!["A", "B", "C", "D"].includes(trigger.kind as string)) {
			throw new Error(`deep-interview ${triggerField}.kind is invalid`);
		}
		if (!["active", "disputed", "unresolved"].includes(trigger.status as string)) {
			throw new Error(`deep-interview ${triggerField}.status is invalid`);
		}
		for (const key of ["name", "component", "dimension", "rationale"] as const) {
			requireString(trigger[key], `${triggerField}.${key}`);
		}
		for (const key of ["evidence", "contradictedFactId"] as const) {
			if (trigger[key] !== undefined) requireString(trigger[key], `${triggerField}.${key}`);
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
		assertOnlyKeys(
			round,
			[
				"round_key",
				"round_id",
				"round",
				"question_id",
				"question_text",
				"question_hash",
				"answer_hash",
				"selected_options",
				"custom_input",
				"component",
				"dimension",
				"ambiguity_at_ask",
				"lifecycle",
				"answered_at",
				"scored_at",
				"scores",
				"ambiguity",
				"triggers",
			],
			field,
		);
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
		assertOnlyKeys(fact, ["id", "statement", "round", "component", "dimension", "evidence", "disputed"], field);
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
	assertOnlyKeys(
		value,
		[
			"round",
			"question_id",
			"question_text",
			"component",
			"dimension",
			"ambiguity_at_ask",
			"rationale",
			"planned_at",
		],
		field,
	);
	if (!Number.isInteger(value.round) || (value.round as number) < 1) {
		throw new Error(`deep-interview ${field}.round must be a positive integer`);
	}
	const question: DeepInterviewPlannedQuestion = {
		round: value.round as number,
		question_id: requireString(value.question_id, `${field}.question_id`),
		question_text: requireString(value.question_text, `${field}.question_text`),
		rationale: requireString(value.rationale, `${field}.rationale`),
		planned_at: requireTimestamp(value.planned_at, `${field}.planned_at`),
	};
	for (const key of ["component", "dimension"] as const) {
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

function parseTopology(value: unknown): DeepInterviewTopology {
	if (!isRecord(value) || !Array.isArray(value.components) || !Array.isArray(value.deferrals)) {
		throw new Error("deep-interview state.topology requires components and deferrals arrays");
	}
	assertOnlyKeys(
		value,
		["status", "confirmed_at", "components", "deferrals", "last_targeted_component_id"],
		"state.topology",
	);
	if (value.status !== "pending" && value.status !== "confirmed") {
		throw new Error("deep-interview state.topology.status must be pending or confirmed");
	}
	const components = value.components.map((component, index) => {
		const field = `state.topology.components[${index}]`;
		if (!isRecord(component)) throw new Error(`deep-interview ${field} must be an object`);
		assertOnlyKeys(
			component,
			["id", "name", "description", "status", "evidence", "clarity_scores", "weakest_dimension"],
			field,
		);
		if (component.status !== "active" && component.status !== "deferred") {
			throw new Error(`deep-interview ${field}.status must be active or deferred`);
		}
		if (!Array.isArray(component.evidence)) throw new Error(`deep-interview ${field}.evidence must be an array`);
		const evidence = component.evidence.map((item, evidenceIndex) =>
			requireString(item, `${field}.evidence[${evidenceIndex}]`),
		);
		const parsed: DeepInterviewTopology["components"][number] = {
			id: requireString(component.id, `${field}.id`),
			name: requireString(component.name, `${field}.name`),
			description: requireString(component.description, `${field}.description`),
			status: component.status,
			evidence,
		};
		if (component.clarity_scores !== undefined) {
			if (!isRecord(component.clarity_scores)) {
				throw new Error(`deep-interview ${field}.clarity_scores must be an object`);
			}
			assertOnlyKeys(
				component.clarity_scores,
				["goal", "constraints", "criteria", "context"],
				`${field}.clarity_scores`,
			);
			const scores: NonNullable<(typeof parsed)["clarity_scores"]> = {};
			for (const dimension of ["goal", "constraints", "criteria", "context"] as const) {
				const score = component.clarity_scores[dimension];
				if (score === undefined) continue;
				if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
					throw new Error(`deep-interview ${field}.clarity_scores.${dimension} must be between 0 and 1`);
				}
				scores[dimension] = score;
			}
			parsed.clarity_scores = scores;
		}
		if (component.weakest_dimension !== undefined) {
			parsed.weakest_dimension = requireString(component.weakest_dimension, `${field}.weakest_dimension`);
		}
		return parsed;
	});
	const componentIds = new Set(components.map((component) => component.id));
	if (componentIds.size !== components.length) throw new Error("deep-interview topology component ids must be unique");
	const deferrals = value.deferrals.map((deferral, index) => {
		const field = `state.topology.deferrals[${index}]`;
		if (!isRecord(deferral)) throw new Error(`deep-interview ${field} must be an object`);
		assertOnlyKeys(deferral, ["component_id", "reason", "confirmed_at"], field);
		return {
			component_id: requireString(deferral.component_id, `${field}.component_id`),
			reason: requireString(deferral.reason, `${field}.reason`),
			confirmed_at: requireTimestamp(deferral.confirmed_at, `${field}.confirmed_at`),
		};
	});
	const deferredIds = new Set(
		components.filter((component) => component.status === "deferred").map((component) => component.id),
	);
	const deferralIds = new Set(deferrals.map((deferral) => deferral.component_id));
	if (deferralIds.size !== deferrals.length || deferrals.some((deferral) => !deferredIds.has(deferral.component_id))) {
		throw new Error("deep-interview topology deferrals must uniquely reference deferred components");
	}
	if (deferredIds.size !== deferralIds.size) {
		throw new Error("deep-interview every deferred component requires a deferral record");
	}
	if (value.status === "pending") {
		if (
			value.confirmed_at !== undefined ||
			value.last_targeted_component_id !== undefined ||
			components.length > 0 ||
			deferrals.length > 0
		) {
			throw new Error("deep-interview pending topology must be empty and unconfirmed");
		}
		return { status: "pending", components: [], deferrals: [] };
	}
	if (components.length === 0) throw new Error("deep-interview confirmed topology requires components");
	const topology: DeepInterviewTopology = {
		status: "confirmed",
		confirmed_at: requireTimestamp(value.confirmed_at, "state.topology.confirmed_at"),
		components,
		deferrals,
	};
	if (value.last_targeted_component_id !== undefined) {
		const componentId = requireString(value.last_targeted_component_id, "state.topology.last_targeted_component_id");
		if (!componentIds.has(componentId)) {
			throw new Error("deep-interview topology last target must reference a component");
		}
		topology.last_targeted_component_id = componentId;
	}
	return topology;
}

function parseOrchestration(value: unknown): DeepInterviewOrchestrationState {
	if (!isRecord(value)) throw new Error("deep-interview state.orchestration must be an object");
	assertOnlyKeys(
		value,
		[
			"status",
			"next_question",
			"next_dimension",
			"question_plan",
			"waiting_since",
			"last_answered_question_id",
			"last_scored_question_id",
		],
		"state.orchestration",
	);
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
	if (Object.hasOwn(envelope, "closure_overrides")) {
		throw new Error("deep-interview closure_overrides is removed; use goal_adjustments");
	}
	if (envelope.threshold !== undefined) envelope.threshold = requireRatio(envelope.threshold, "threshold");
	if (envelope.threshold_source !== undefined) {
		envelope.threshold_source = requireString(envelope.threshold_source, "threshold_source");
	}
	if (envelope.goal_adjustments !== undefined) {
		if (!Array.isArray(envelope.goal_adjustments)) {
			throw new Error("deep-interview goal_adjustments must be an array");
		}
		envelope.goal_adjustments = envelope.goal_adjustments.map((reason, index) =>
			requireString(reason, `goal_adjustments[${index}]`),
		);
	}
	if (canonical) {
		if (typeof envelope.active !== "boolean") throw new Error("deep-interview active must be a boolean");
		requireString(envelope.current_phase, "current_phase");
		if (envelope.threshold === undefined) throw new Error("deep-interview threshold is required");
	}
	if (envelope.state === undefined) {
		if (canonical) throw new Error("deep-interview envelope.state is required");
		return envelope;
	}
	if (!isRecord(envelope.state)) throw new Error("deep-interview envelope.state must be an object");
	const state = { ...envelope.state };
	if (Object.hasOwn(state, "_restate_loops")) {
		throw new Error("deep-interview state._restate_loops is removed; use state.restate_loops");
	}
	if (canonical) state.interview_id = requireString(state.interview_id, "state.interview_id");
	else if (state.interview_id !== undefined)
		state.interview_id = requireString(state.interview_id, "state.interview_id");
	if (Object.hasOwn(state, "rounds")) state.rounds = parseRounds(state.rounds);
	else if (canonical) throw new Error("deep-interview state.rounds is required");
	if (Object.hasOwn(state, "established_facts")) state.established_facts = parseFacts(state.established_facts);
	else if (canonical) throw new Error("deep-interview state.established_facts is required");
	if (state.orchestration !== undefined) state.orchestration = parseOrchestration(state.orchestration);
	if (state.topology !== undefined) state.topology = parseTopology(state.topology);
	if (state.current_ambiguity !== undefined) {
		state.current_ambiguity = requireRatio(state.current_ambiguity, "state.current_ambiguity");
	}
	for (const field of [
		"auto_answer_streak",
		"lateral_panel_failures",
		"architect_failures",
		"restate_loops",
	] as const) {
		if (state[field] !== undefined) state[field] = requireNonNegativeInteger(state[field], `state.${field}`);
	}
	for (const field of ["refined_rounds", "auto_researched_rounds", "auto_answered_rounds"] as const) {
		if (state[field] !== undefined) state[field] = parseRoundNumbers(state[field], `state.${field}`);
	}
	for (const field of ["lateral_reviews", "ontology_snapshots"] as const) {
		if (state[field] !== undefined && !Array.isArray(state[field])) {
			throw new Error(`deep-interview state.${field} must be an array`);
		}
	}
	if (state.ambiguity_milestone !== undefined) {
		state.ambiguity_milestone = requireString(state.ambiguity_milestone, "state.ambiguity_milestone");
	}
	if (state.type !== undefined && state.type !== "greenfield" && state.type !== "brownfield") {
		throw new Error("deep-interview state.type must be greenfield or brownfield");
	}
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
		if (key !== "state") merged[key] = value;
	}

	const state: Record<string, unknown> = { ...(prior.state as Record<string, unknown>) };
	if (patch.state !== undefined) {
		for (const [key, value] of Object.entries(patch.state)) state[key] = value;
	}
	merged.state = state;
	return normalizeDeepInterviewEnvelope(merged);
}
