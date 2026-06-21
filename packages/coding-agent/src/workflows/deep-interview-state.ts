import { createHash } from "node:crypto";

/**
 * Default deep-interview ambiguity threshold. The interview is considered
 * ready to finalize once ambiguity is at or below this value. Single default,
 * no per-mode fallback tiers.
 */
export const DEFAULT_DEEP_INTERVIEW_THRESHOLD = 0.05;

export type DeepInterviewRoundLifecycle = "answered" | "pending_scoring" | "scored";
export type DeepInterviewTriggerKind = "A" | "B" | "C" | "D";
export type DeepInterviewTriggerStatus = "active" | "disputed" | "unresolved";

export interface DeepInterviewEstablishedFact {
	id: string;
	statement: string;
	round: number;
	component?: string;
	dimension?: string;
	evidence?: string;
	disputed: boolean;
}

export interface DeepInterviewTriggerMetadata {
	kind: DeepInterviewTriggerKind;
	name: string;
	status: DeepInterviewTriggerStatus;
	component: string;
	dimension: string;
	priorDimensionScore?: number;
	newDimensionScore?: number;
	priorAmbiguity?: number;
	newAmbiguity?: number;
	evidence?: string;
	contradictedFactId?: string;
	rationale?: string;
}

export type DeepInterviewOrchestrationStatus =
	| "interviewing"
	| "waiting_for_answer"
	| "pending_scoring"
	| "ready_to_finalize";

export interface DeepInterviewPlannedQuestion {
	round: number;
	question_id: string;
	question_text: string;
	component?: string;
	dimension?: string;
	ambiguity_at_ask?: number;
	rationale?: string;
	planned_at: string;
}

export interface DeepInterviewOrchestrationState {
	status: DeepInterviewOrchestrationStatus;
	next_question?: DeepInterviewPlannedQuestion;
	next_dimension?: string;
	question_plan?: DeepInterviewPlannedQuestion[];
	waiting_since?: string;
	last_answered_question_id?: string;
	last_scored_question_id?: string;
}

export interface DeepInterviewRoundRecord {
	round_key: string;
	round_id?: string;
	round: number;
	question_id?: string;
	question_text?: string;
	question_hash: string;
	answer_hash: string;
	selected_options?: string[];
	custom_input?: string;
	component?: string;
	dimension?: string;
	ambiguity_at_ask?: number;
	lifecycle: DeepInterviewRoundLifecycle;
	answered_at: string;
	scored_at?: string;
	scores?: Record<string, number>;
	ambiguity?: number;
	triggers?: DeepInterviewTriggerMetadata[];
}

export interface DeepInterviewStateEnvelope {
	threshold?: number;
	threshold_source?: string;
	state?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface DeepInterviewCompactState {
	threshold?: number;
	threshold_source?: string;
	current_ambiguity?: number;
	topology_summary?: { active: number; deferred: number; components: string[] };
	orchestration?: DeepInterviewOrchestrationState;
	established_facts: DeepInterviewEstablishedFact[];
	unresolved_triggers: DeepInterviewTriggerMetadata[];
	recent_scored_rounds: DeepInterviewRoundRecord[];
	pending_shells: DeepInterviewRoundRecord[];
}

export interface TransitionValidationResult {
	ok: boolean;
	violations: string[];
}

const TRANSCRIPT_STATE_FIELDS = [
	"rounds",
	"established_facts",
	"current_ambiguity",
	"topology",
	"ontology_snapshots",
	"auto_researched_rounds",
	"auto_answered_rounds",
	"architect_failures",
	"orchestration",
] as const;

const HOISTED_STATE_FIELDS = [
	"initial_idea",
	"initial_context_summary",
	"codebase_context",
	"challenge_modes_used",
	"interview_id",
	"type",
	"language",
	"threshold",
	"threshold_source",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

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
	interviewId: string | undefined,
	input: { round_id?: string; round: number; questionId?: string },
): string {
	const interview = interviewId && interviewId.trim() !== "" ? interviewId : "nointerview";
	if (input.round_id && input.round_id.trim() !== "") return `${interview}::rid:${input.round_id}`;
	return `${interview}::r:${input.round}::q:${input.questionId ?? "noqid"}`;
}

export function normalizeDeepInterviewEnvelope(value: unknown): DeepInterviewStateEnvelope {
	const envelope: DeepInterviewStateEnvelope = isPlainObject(value) ? { ...value } : {};
	const inner: Record<string, unknown> = isPlainObject(envelope.state) ? { ...envelope.state } : {};

	for (const field of TRANSCRIPT_STATE_FIELDS) {
		if (inner[field] === undefined && envelope[field] !== undefined) inner[field] = envelope[field];
		if (field in envelope) delete envelope[field];
	}
	for (const field of HOISTED_STATE_FIELDS) {
		if (inner[field] === undefined && envelope[field] !== undefined) inner[field] = envelope[field];
	}
	if (!Array.isArray(inner.rounds)) inner.rounds = [];
	if (!Array.isArray(inner.established_facts)) inner.established_facts = [];
	envelope.state = inner;
	return envelope;
}

function durableRoundKey(record: Record<string, unknown>): string | undefined {
	if (nonEmptyString(record.round_key)) return record.round_key;
	const hasId = nonEmptyString(record.round_id) || nonEmptyString(record.question_id);
	if (!hasId) return undefined;
	return deriveRoundKey(undefined, {
		round_id: nonEmptyString(record.round_id) ? record.round_id : undefined,
		round: typeof record.round === "number" ? record.round : 0,
		questionId: nonEmptyString(record.question_id) ? record.question_id : undefined,
	});
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const aKeys = Object.keys(a);
		const bKeys = Object.keys(b);
		return aKeys.length === bKeys.length && aKeys.every((key) => deepEqual(a[key], b[key]));
	}
	return false;
}

function mergeRoundPair(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...existing };
	for (const [key, value] of Object.entries(incoming)) {
		if (value !== undefined) merged[key] = value;
	}
	if (existing.lifecycle === "scored" && incoming.lifecycle !== "scored") merged.lifecycle = "scored";
	for (const field of ["question_hash", "answer_hash", "question_text"]) {
		if (!nonEmptyString(incoming[field]) && nonEmptyString(existing[field])) merged[field] = existing[field];
	}
	return merged;
}

function mergeDeepInterviewRounds(
	existing: readonly Record<string, unknown>[],
	incoming: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
	const result: Record<string, unknown>[] = [];
	const indexByKey = new Map<string, number>();
	const add = (record: Record<string, unknown>): void => {
		const key = durableRoundKey(record);
		if (key !== undefined) {
			const existingIndex = indexByKey.get(key);
			if (existingIndex === undefined) {
				const stored = nonEmptyString(record.round_key) ? { ...record } : { ...record, round_key: key };
				indexByKey.set(key, result.length);
				result.push(stored);
			} else {
				result[existingIndex] = mergeRoundPair(result[existingIndex], record);
			}
			return;
		}
		if (result.some((item) => deepEqual(item, record))) return;
		result.push({ ...record });
	};
	for (const record of existing) if (isPlainObject(record)) add(record);
	for (const record of incoming) if (isPlainObject(record)) add(record);
	return result;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

export function mergeDeepInterviewEnvelope(
	existing: unknown,
	incoming: unknown,
	options: { replace?: boolean } = {},
): DeepInterviewStateEnvelope {
	const incomingEnvelope = isPlainObject(incoming) ? incoming : {};
	const incomingNestedState = isPlainObject(incomingEnvelope.state) ? incomingEnvelope.state : {};
	const incomingHasEstablishedFacts =
		Object.hasOwn(incomingNestedState, "established_facts") || Object.hasOwn(incomingEnvelope, "established_facts");
	const normalizedIncoming = normalizeDeepInterviewEnvelope(incoming);
	if (options.replace) return normalizedIncoming;

	const normalizedExisting = normalizeDeepInterviewEnvelope(existing);
	const merged: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(normalizedExisting)) if (key !== "state") merged[key] = value;
	for (const [key, value] of Object.entries(normalizedIncoming)) {
		if (key === "state") continue;
		if (value === null) delete merged[key];
		else merged[key] = value;
	}

	const existingState = isPlainObject(normalizedExisting.state) ? normalizedExisting.state : {};
	const incomingState = isPlainObject(normalizedIncoming.state) ? normalizedIncoming.state : {};
	const mergedState: Record<string, unknown> = { ...existingState };
	for (const [key, value] of Object.entries(incomingState)) {
		if (key === "rounds") continue;
		if (key === "established_facts" && !incomingHasEstablishedFacts) continue;
		if (value === null) delete mergedState[key];
		else mergedState[key] = value;
	}
	mergedState.rounds = mergeDeepInterviewRounds(
		asRecordArray(existingState.rounds),
		asRecordArray(incomingState.rounds),
	);
	merged.state = mergedState;
	return merged as DeepInterviewStateEnvelope;
}

export function validateDeepInterviewScoredTransition(
	prior: DeepInterviewRoundRecord | undefined,
	next: DeepInterviewRoundRecord,
): TransitionValidationResult {
	const violations: string[] = [];
	for (const trigger of next.triggers ?? []) {
		if (trigger.status === "disputed" || trigger.status === "unresolved") {
			if (!trigger.rationale || trigger.rationale.trim() === "") {
				violations.push(`trigger ${trigger.kind} is ${trigger.status} but has no rationale`);
			}
			continue;
		}
		if (!prior) continue;
		if (typeof prior.ambiguity !== "number" || typeof next.ambiguity !== "number") {
			violations.push(`active trigger ${trigger.kind} is missing ambiguity metrics to prove a rise`);
		} else if (!(next.ambiguity > prior.ambiguity)) {
			violations.push(
				`active trigger ${trigger.kind} did not raise ambiguity (${prior.ambiguity} -> ${next.ambiguity})`,
			);
		}
		const priorDim = prior.scores?.[trigger.dimension] ?? trigger.priorDimensionScore;
		const nextDim = next.scores?.[trigger.dimension] ?? trigger.newDimensionScore;
		if (typeof priorDim !== "number" || typeof nextDim !== "number") {
			violations.push(
				`active trigger ${trigger.kind} is missing dimension "${trigger.dimension}" scores to prove non-improvement`,
			);
		} else if (nextDim > priorDim) {
			violations.push(
				`active trigger ${trigger.kind} on dimension "${trigger.dimension}" improved clarity ${priorDim} -> ${nextDim}`,
			);
		}
	}
	return { ok: violations.length === 0, violations };
}

function readRounds(envelope: DeepInterviewStateEnvelope): DeepInterviewRoundRecord[] {
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	return Array.isArray(inner.rounds) ? (inner.rounds as DeepInterviewRoundRecord[]) : [];
}

export function projectCompactState(value: unknown, options: { lastN?: number } = {}): DeepInterviewCompactState {
	const lastN = options.lastN ?? 3;
	const envelope = normalizeDeepInterviewEnvelope(value);
	const inner = (envelope.state ?? {}) as Record<string, unknown>;
	const rounds = readRounds(envelope);
	const scored = rounds.filter((round) => round.lifecycle === "scored");
	const pending = rounds.filter((round) => round.lifecycle !== "scored");
	const latestScored = scored.at(-1);
	const established = Array.isArray(inner.established_facts)
		? (inner.established_facts as DeepInterviewEstablishedFact[])
		: [];
	const unresolved: DeepInterviewTriggerMetadata[] = [];
	for (const round of scored) {
		for (const trigger of round.triggers ?? []) {
			if (trigger.status === "unresolved" || trigger.status === "disputed") unresolved.push(trigger);
		}
	}
	const topology = inner.topology as { components?: Array<{ status?: string; name?: string }> } | undefined;
	let topologySummary: DeepInterviewCompactState["topology_summary"];
	if (topology && Array.isArray(topology.components)) {
		const active = topology.components.filter((component) => component.status !== "deferred");
		topologySummary = {
			active: active.length,
			deferred: topology.components.length - active.length,
			components: topology.components.map((component) => component.name ?? "").filter(Boolean),
		};
	}
	return {
		threshold:
			typeof envelope.threshold === "number"
				? envelope.threshold
				: ((inner.threshold as number | undefined) ?? DEFAULT_DEEP_INTERVIEW_THRESHOLD),
		threshold_source:
			typeof envelope.threshold_source === "string"
				? envelope.threshold_source
				: (inner.threshold_source as string | undefined),
		current_ambiguity:
			typeof latestScored?.ambiguity === "number"
				? latestScored.ambiguity
				: (inner.current_ambiguity as number | undefined),
		topology_summary: topologySummary,
		orchestration: isPlainObject(inner.orchestration)
			? (inner.orchestration as unknown as DeepInterviewOrchestrationState)
			: undefined,
		established_facts: established,
		unresolved_triggers: unresolved,
		recent_scored_rounds: scored.slice(-lastN),
		pending_shells: pending,
	};
}
