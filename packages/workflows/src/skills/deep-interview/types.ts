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
	priorAmbiguity?: number;
	newAmbiguity?: number;
	evidence?: string;
	contradictedFactId?: string;
	rationale: string;
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
	rationale: string;
	planned_at: string;
}

export interface DeepInterviewOrchestrationState {
	status: DeepInterviewOrchestrationStatus;
	next_question?: DeepInterviewPlannedQuestion;
	next_dimension?: string;
	question_plan: DeepInterviewPlannedQuestion[];
	waiting_since?: string;
	last_answered_question_id?: string;
	last_scored_question_id?: string;
}

export interface DeepInterviewRoundRecord {
	round_key: string;
	round_id?: string;
	round: number;
	question_id: string;
	question_text: string;
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

export interface DeepInterviewTopologyComponent {
	id: string;
	name: string;
	description: string;
	status: "active" | "deferred";
	evidence: string[];
	clarity_scores?: Partial<Record<"goal" | "constraints" | "criteria" | "context", number>>;
	weakest_dimension?: string;
}

export interface DeepInterviewTopologyDeferral {
	component_id: string;
	reason: string;
	confirmed_at: string;
}

export interface DeepInterviewPendingTopology {
	status: "pending";
	components: DeepInterviewTopologyComponent[];
	deferrals: DeepInterviewTopologyDeferral[];
}

export interface DeepInterviewConfirmedTopology {
	status: "confirmed";
	confirmed_at: string;
	components: DeepInterviewTopologyComponent[];
	deferrals: DeepInterviewTopologyDeferral[];
	last_targeted_component_id?: string;
}

export type DeepInterviewTopology = DeepInterviewPendingTopology | DeepInterviewConfirmedTopology;

export interface DeepInterviewState extends Record<string, unknown> {
	interview_id: string;
	rounds: DeepInterviewRoundRecord[];
	established_facts: DeepInterviewEstablishedFact[];
	type?: "greenfield" | "brownfield";
	orchestration?: DeepInterviewOrchestrationState;
	topology?: DeepInterviewTopology;
	current_ambiguity?: number;
	auto_answer_streak?: number;
	refined_rounds?: number[];
	ambiguity_milestone?: string;
	lateral_reviews?: unknown[];
	lateral_panel_failures?: number;
	auto_researched_rounds?: number[];
	auto_answered_rounds?: number[];
	architect_failures?: number;
	ontology_snapshots?: unknown[];
	restate_loops?: number;
}

export interface DeepInterviewStateEnvelope {
	active: boolean;
	current_phase: string;
	threshold: number;
	threshold_source?: string;
	state: DeepInterviewState;
	/** Restated one-sentence goal covering all active components. Set via restate-goal gate. */
	restated_goal?: string;
	/** User-requested corrections from the restated-goal gate. */
	goal_adjustments?: string[];
	[key: string]: unknown;
}

/**
 * Scoring-time state patch carried by `pi workflow deep-interview record-scoring`. This is the
 * canonical channel for mid-interview state updates. It is applied through
 * `mergeDeepInterviewEnvelope`; callers provide complete replacement lists for list fields.
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
export type DeepInterviewAdvisoryMetadata = Partial<
	Pick<
		DeepInterviewState,
		| "auto_answer_streak"
		| "refined_rounds"
		| "ambiguity_milestone"
		| "lateral_reviews"
		| "lateral_panel_failures"
		| "auto_researched_rounds"
		| "auto_answered_rounds"
		| "architect_failures"
		| "established_facts"
		| "ontology_snapshots"
		| "topology"
	>
>;

export interface TransitionValidationResult {
	ok: boolean;
	violations: string[];
}

export interface DeepInterviewAnswerInput {
	round: number;
	round_id?: string;
	questionId: string;
	questionText: string;
	component?: string;
	dimension?: string;
	ambiguity?: number;
	selectedOptions?: string[];
	customInput?: string;
	topology?: DeepInterviewTopology;
}

export interface DeepInterviewQuestionPlanInput {
	round: number;
	questionId: string;
	questionText: string;
	component?: string;
	dimension?: string;
	ambiguity?: number;
	rationale: string;
}

export interface DeepInterviewScoringInput {
	round: number;
	round_id?: string;
	questionId: string;
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
