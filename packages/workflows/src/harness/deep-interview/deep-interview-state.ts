import { createHash } from "node:crypto";
import {
	type ObstacleInput,
	type ObstacleValidator,
	type ObstacleViolation,
	validateObstacles,
} from "#src/harness/shared/audit/decision-ledger";

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
	/** Restated one-sentence goal covering all active components. Set via restate-goal gate. */
	restated_goal?: string;
	/** Closure override reasons when closure was accepted despite gaps. */
	closure_overrides?: string[];
	[key: string]: unknown;
}

/**
 * Scoring-time state patch carried by `pi workflow deep-interview record-scoring`. This is the
 * ONLY safe channel for mid-interview `state` updates: it is merged into `state`
 * through `mergeDeepInterviewEnvelope` (never clobbering `rounds`), unlike a raw
 * `pi workflow state write` which shallow-merges `state` and would drop `rounds`.
 *
 * Two groups:
 *  - Advisory counters drive the dialectic rhythm guard (`auto_answer_streak`),
 *    lateral-panel milestone triggers (`ambiguity_milestone`), and spec metadata.
 *  - `established_facts`, `ontology_snapshots`, and `topology` are full-list
 *    replacements (read current, modify, write the full list). They close the gap
 *    between the documented methodology and the runtime: the closure guard reads
 *    `established_facts` for coverage, the HUD reads `topology.components[].
 *    weakest_dimension` and `topology.last_targeted_component_id`, and the spec
 *    reports ontology convergence from `ontology_snapshots`.
 */
export interface DeepInterviewAdvisoryMetadata {
	auto_answer_streak?: number;
	refined_rounds?: number[];
	ambiguity_milestone?: string;
	lateral_reviews?: unknown[];
	lateral_panel_failures?: number;
	auto_researched_rounds?: number[];
	auto_answered_rounds?: number[];
	architect_failures?: number;
	/** Full-list replacement (opaque; the closure guard casts to established-fact shape). */
	established_facts?: unknown[];
	/** Full-list replacement of ontology snapshots; feeds spec convergence reporting. */
	ontology_snapshots?: unknown[];
	/** Full-list replacement; the HUD reads per-component weakest_dimension + last_targeted_component_id. */
	topology?: unknown;
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
	auto_answer_streak?: number;
	ambiguity_milestone?: string;
	advisory_counters?: {
		auto_researched_rounds: number;
		auto_answered_rounds: number;
		refined_rounds: number;
		lateral_reviews: number;
		lateral_panel_failures: number;
		architect_failures: number;
	};
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

/**
 * Deep-interview adapter for the shared integrity wall (`validateObstacles`).
 *
 * Maps a round's `DeepInterviewTriggerMetadata` into the normalized
 * `ObstacleInput` shape, supplies the skill-specific "blocked dimension must
 * not improve" check, and formats structured violations back into the exact
 * historical message strings so behavior and diagnostics are unchanged.
 */
interface DeepInterviewDimensionContext {
	priorScores?: Record<string, number>;
	nextScores?: Record<string, number>;
}

const deepInterviewObstacleValidator: ObstacleValidator<DeepInterviewDimensionContext> = {
	validateActive(obstacle, { priorScores, nextScores }) {
		const violations: ObstacleViolation[] = [];
		const dimension = obstacle.scope?.dimension;
		if (dimension === undefined) return violations;
		const priorDim = priorScores?.[dimension] ?? obstacle.fallbackPriorValue;
		const nextDim = nextScores?.[dimension] ?? obstacle.fallbackNewValue;
		if (typeof priorDim !== "number" || typeof nextDim !== "number") {
			violations.push({ code: "missing_dimension_scores", kind: obstacle.kind, dimension });
		} else if (nextDim > priorDim) {
			violations.push({
				code: "dimension_improved",
				kind: obstacle.kind,
				dimension,
				priorValue: priorDim,
				newValue: nextDim,
			});
		}
		return violations;
	},
};

function mapDeepInterviewTriggersToObstacles(
	triggers: DeepInterviewTriggerMetadata[],
	prior: DeepInterviewRoundRecord | undefined,
	next: DeepInterviewRoundRecord,
): { obstacles: ObstacleInput[]; skillCtx: DeepInterviewDimensionContext } {
	const priorAmbiguity = prior?.ambiguity;
	const nextAmbiguity = next.ambiguity;
	const regression =
		typeof priorAmbiguity === "number" && typeof nextAmbiguity === "number"
			? { metric: "ambiguity", priorValue: priorAmbiguity, newValue: nextAmbiguity, direction: "rise" as const }
			: undefined;
	const obstacles: ObstacleInput[] = triggers.map((trigger) => ({
		kind: trigger.kind,
		status: trigger.status,
		rationale: trigger.rationale,
		regression,
		scope: { dimension: trigger.dimension, component: trigger.component },
		fallbackPriorValue: trigger.priorDimensionScore,
		fallbackNewValue: trigger.newDimensionScore,
	}));
	return { obstacles, skillCtx: { priorScores: prior?.scores, nextScores: next.scores } };
}

function formatDeepInterviewViolations(violations: ObstacleViolation[]): string[] {
	return violations.map((violation) => {
		switch (violation.code) {
			case "missing_rationale":
				return `trigger ${violation.kind} is ${violation.status} but has no rationale`;
			case "missing_regression_metrics":
				return `active trigger ${violation.kind} is missing ambiguity metrics to prove a rise`;
			case "no_regression":
				return `active trigger ${violation.kind} did not raise ambiguity (${violation.priorValue} -> ${violation.newValue})`;
			case "missing_dimension_scores":
				return `active trigger ${violation.kind} is missing dimension "${violation.dimension}" scores to prove non-improvement`;
			case "dimension_improved":
				return `active trigger ${violation.kind} on dimension "${violation.dimension}" improved clarity ${violation.priorValue} -> ${violation.newValue}`;
			default:
				return `active trigger ${violation.kind} is invalid`;
		}
	});
}

export function validateDeepInterviewScoredTransition(
	prior: DeepInterviewRoundRecord | undefined,
	next: DeepInterviewRoundRecord,
): TransitionValidationResult {
	const { obstacles, skillCtx } = mapDeepInterviewTriggersToObstacles(next.triggers ?? [], prior, next);
	const result = validateObstacles(obstacles, deepInterviewObstacleValidator, skillCtx, {
		priorPresent: prior !== undefined,
	});
	return { ok: result.ok, violations: formatDeepInterviewViolations(result.violations) };
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
	const advisoryCounters = {
		auto_researched_rounds: Array.isArray(inner.auto_researched_rounds) ? inner.auto_researched_rounds.length : 0,
		auto_answered_rounds: Array.isArray(inner.auto_answered_rounds) ? inner.auto_answered_rounds.length : 0,
		refined_rounds: Array.isArray(inner.refined_rounds) ? inner.refined_rounds.length : 0,
		lateral_reviews: Array.isArray(inner.lateral_reviews) ? inner.lateral_reviews.length : 0,
		lateral_panel_failures: typeof inner.lateral_panel_failures === "number" ? inner.lateral_panel_failures : 0,
		architect_failures: typeof inner.architect_failures === "number" ? inner.architect_failures : 0,
	};
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
		auto_answer_streak: typeof inner.auto_answer_streak === "number" ? inner.auto_answer_streak : undefined,
		ambiguity_milestone: typeof inner.ambiguity_milestone === "string" ? inner.ambiguity_milestone : undefined,
		advisory_counters: advisoryCounters,
	};
}
