import { type Static, Type } from "typebox";

export const emptySchema = Type.Object({});

export const planQuestionSchema = Type.Object({
	round: Type.Integer({ minimum: 1, description: "Question round number." }),
	questionId: Type.String({ minLength: 1, description: "Stable question id." }),
	questionText: Type.String({ minLength: 1, description: "The exact one-question prompt to ask." }),
	component: Type.Optional(Type.String({ minLength: 1, description: "Target topology component id or name." })),
	dimension: Type.Optional(Type.String({ minLength: 1, description: "Target clarity dimension." })),
	ambiguity: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: "Ambiguity at ask time." })),
	rationale: Type.String({ minLength: 1, description: "Why this component/dimension is the bottleneck." }),
});

const clarityScoresSchema = Type.Object({
	goal: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	constraints: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	criteria: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	context: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

const topologyComponentSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.String({ minLength: 1 }),
	description: Type.String({ minLength: 1 }),
	status: Type.Union([Type.Literal("active"), Type.Literal("deferred")]),
	evidence: Type.Array(Type.String({ minLength: 1 })),
	clarity_scores: Type.Optional(clarityScoresSchema),
	weakest_dimension: Type.Optional(Type.String({ minLength: 1 })),
});

const topologyDeferralSchema = Type.Object({
	component_id: Type.String({ minLength: 1 }),
	reason: Type.String({ minLength: 1 }),
	confirmed_at: Type.String({ minLength: 1 }),
});

const topologySchema = Type.Union([
	Type.Object({
		status: Type.Literal("pending"),
		components: Type.Array(topologyComponentSchema, { maxItems: 0 }),
		deferrals: Type.Array(topologyDeferralSchema, { maxItems: 0 }),
	}),
	Type.Object({
		status: Type.Literal("confirmed"),
		confirmed_at: Type.String({ minLength: 1 }),
		components: Type.Array(topologyComponentSchema, { minItems: 1 }),
		deferrals: Type.Array(topologyDeferralSchema),
		last_targeted_component_id: Type.Optional(Type.String({ minLength: 1 })),
	}),
]);

const triggerSchema = Type.Object({
	kind: Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C"), Type.Literal("D")]),
	name: Type.String({ minLength: 1 }),
	status: Type.Union([Type.Literal("active"), Type.Literal("disputed"), Type.Literal("unresolved")]),
	component: Type.String({ minLength: 1 }),
	dimension: Type.String({ minLength: 1 }),
	rationale: Type.String({ minLength: 1 }),
	evidence: Type.Optional(Type.String({ minLength: 1 })),
	contradictedFactId: Type.Optional(Type.String({ minLength: 1 })),
	priorAmbiguity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	newAmbiguity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

const establishedFactSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	statement: Type.String({ minLength: 1 }),
	round: Type.Integer({ minimum: 1 }),
	component: Type.Optional(Type.String({ minLength: 1 })),
	dimension: Type.Optional(Type.String({ minLength: 1 })),
	evidence: Type.Optional(Type.String({ minLength: 1 })),
	disputed: Type.Boolean(),
});

const advisoryMetadataSchema = Type.Object({
	auto_answer_streak: Type.Optional(Type.Integer({ minimum: 0 })),
	refined_rounds: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
	ambiguity_milestone: Type.Optional(Type.String({ minLength: 1 })),
	lateral_reviews: Type.Optional(Type.Array(Type.Any())),
	lateral_panel_failures: Type.Optional(Type.Integer({ minimum: 0 })),
	auto_researched_rounds: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
	auto_answered_rounds: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
	architect_failures: Type.Optional(Type.Integer({ minimum: 0 })),
	established_facts: Type.Optional(Type.Array(establishedFactSchema)),
	ontology_snapshots: Type.Optional(Type.Array(Type.Any())),
	topology: Type.Optional(topologySchema),
});

export const recordAnswerSchema = Type.Object({
	round: Type.Integer({ minimum: 1 }),
	round_id: Type.Optional(Type.String({ minLength: 1 })),
	questionId: Type.String({ minLength: 1 }),
	questionText: Type.String({ minLength: 1 }),
	component: Type.Optional(Type.String({ minLength: 1 })),
	dimension: Type.Optional(Type.String({ minLength: 1 })),
	ambiguity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	selectedOptions: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	customInput: Type.Optional(Type.String({ minLength: 1 })),
	topology: Type.Optional(topologySchema),
});

export const recordScoringSchema = Type.Object({
	round: Type.Integer({ minimum: 1 }),
	round_id: Type.Optional(Type.String({ minLength: 1 })),
	questionId: Type.String({ minLength: 1 }),
	scores: Type.Record(Type.String(), Type.Number({ minimum: 0, maximum: 1 })),
	ambiguity: Type.Number({ minimum: 0, maximum: 1 }),
	triggers: Type.Optional(Type.Array(triggerSchema)),
	metadata: Type.Optional(advisoryMetadataSchema),
});

export const restateGoalSchema = Type.Object({
	restatedGoal: Type.String({ minLength: 1, description: "One-sentence goal to confirm." }),
	confirm: Type.Union([Type.Literal("Yes"), Type.Literal("Adjust"), Type.Literal("Missing")], {
		description: "Yes, Adjust, or Missing.",
	}),
	adjustment: Type.Optional(Type.String({ minLength: 1 })),
});

export const writeSpecSchema = Type.Object({
	slug: Type.String({ pattern: "^[A-Za-z0-9._-]+$", description: "Safe spec slug." }),
	spec: Type.String({ minLength: 1, description: "Markdown spec content or a readable path to spec content." }),
	handoff: Type.Union(
		[Type.Literal("ralplan"), Type.Literal("ultragoal"), Type.Literal("team"), Type.Literal("stop")],
		{ description: "ralplan, ultragoal, team, or stop." },
	),
	runId: Type.Optional(Type.String({ minLength: 1, description: "Required when handing off to ralplan." })),
});

export type PlanQuestionInput = Static<typeof planQuestionSchema>;
export type RecordAnswerInput = Static<typeof recordAnswerSchema>;
export type RecordScoringInput = Static<typeof recordScoringSchema>;
export type RestateGoalInput = Static<typeof restateGoalSchema>;
export type WriteSpecInput = Static<typeof writeSpecSchema>;
