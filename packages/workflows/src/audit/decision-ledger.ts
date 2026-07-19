/**
 * Shared decision-ledger primitives: the integrity wall behind deep-interview's
 * bidirectional ambiguity scoring, generalized so other workflow skills
 * (ralplan, ultragoal) can adopt the same guarantees:
 *
 *   - disputed / unresolved obstacles must carry a non-empty rationale
 *   - resolved obstacles are always accepted
 *   - active obstacles must prove a real regression (a metric moved the wrong
 *     way, or a weak metric failed to improve), then the skill validator adds
 *     its own checks
 *
 * Phase A scope: deep-interview's `validateDeepInterviewScoredTransition`
 * delegates its active-trigger checks to `validateObstacles` via an adapter,
 * preserving exact behavior and message strings. No storage or ledger is
 * introduced yet (Tier 1 per-skill ledger and Tier 2 cross-skill contract
 * ledger are later phases).
 *
 * This module is deliberately standalone: it imports nothing from any skill so
 * it cannot form an import cycle with `deep-interview/` (which already imports
 * from `shared/`).
 */

/** Lifecycle of a typed obstacle. `resolved` is the terminal success state. */
export type ObstacleStatus = "active" | "disputed" | "unresolved" | "resolved";

/** What "got worse" means for a regression metric. */
export type RegressionDirection = "rise" | "fall" | "unchanged-weak";

/**
 * Proof that an active obstacle's target metric moved the wrong way (or stayed
 * weak). An active obstacle without a regression cannot be validated.
 */
export interface ObstacleRegression {
	metric: string;
	priorValue: number;
	newValue: number;
	direction: RegressionDirection;
}

/**
 * A normalized obstacle the integrity wall can validate. Skills adapt their own
 * records into this shape; the shared core never inspects skill-specific types.
 */
export interface ObstacleInput {
	kind: string;
	status: ObstacleStatus;
	rationale?: string;
	/** Proof of regression for active obstacles (disputed/unresolved/resolved do not need one). */
	regression?: ObstacleRegression;
	/** Target scope the obstacle blocks (e.g. a clarity dimension, a quality-gate criterion, a plan reference). */
	scope?: { dimension?: string; component?: string; criterion?: string; goalId?: string; planRef?: string };
	/** Fallback metric values carried on the obstacle when the transition context lacks them. */
	fallbackPriorValue?: number;
	fallbackNewValue?: number;
}

/**
 * A durable, validated obstacle record persisted to a per-skill ledger. Extends
 * `ObstacleInput` with identity + provenance so an obstacle ledger is queryable
 * (by id, origin skill, scope) and append-only (status transitions set
 * `resolvedAt`/`resolution`; records are never deleted or mutated in place).
 * Skills build these via their own `recordObstacle` helper, which runs
 * `validateObstacles` first. `ObstacleTrigger` is assignable to `ObstacleInput`,
 * so the shared integrity wall validates it unchanged.
 */
export interface ObstacleTrigger extends ObstacleInput {
	id: string;
	name: string;
	evidence?: string;
	/** Skill that recorded the obstacle (e.g. "deep-interview", "ultragoal"). */
	originSkill: string;
	/** Id of the originating round / stage / goal. */
	originRef: string;
	createdAt: string;
	/** Points at a `DecisionFact` this obstacle contradicts (kind=contradiction). */
	contradictedFactId?: string;
	resolvedAt?: string;
	resolution?: string;
}

/**
 * Structured violation. A skill formatter maps these to its own message strings,
 * so the shared core stays message-agnostic while skills preserve their exact
 * historical wording.
 */
export interface ObstacleViolation {
	/** Shared codes plus any skill-specific code (e.g. "missing_dimension_scores"). */
	code: "missing_rationale" | "missing_regression_metrics" | "no_regression" | (string & {});
	kind: string;
	status?: ObstacleStatus;
	metric?: string;
	dimension?: string;
	priorValue?: number;
	newValue?: number;
	direction?: RegressionDirection;
}

/**
 * Per-skill registry of obstacle kinds. Skills whose obstacles are qualitative
 * (no numeric metric to regress, e.g. ralplan critic verdicts) set
 * `needsRegression: false`; the integrity wall then skips the regression-metrics
 * requirement for those kinds and runs only the skill validator.
 */
export type ObstacleKindRegistry = Record<string, { label: string; needsRegression: boolean }>;

/**
 * Skill-specific active-obstacle checks (e.g. for deep-interview: a blocked
 * clarity dimension must not improve). Only invoked for active obstacles when
 * `priorPresent` is true.
 */
export interface ObstacleValidator<TSkillCtx> {
	validateActive(obstacle: ObstacleInput, skillCtx: TSkillCtx): ObstacleViolation[];
}

export interface ObstacleValidationOptions {
	/**
	 * When false, active obstacles are skipped entirely. Mirrors deep-interview's
	 * `if (!prior) continue;`: an active trigger with no prior scored round is
	 * silently accepted (there is nothing to regress against).
	 */
	priorPresent: boolean;
	/**
	 * Optional per-skill kind registry. When a kind has `needsRegression: false`,
	 * active obstacles of that kind skip the regression-metrics requirement and
	 * are validated only by the skill validator. Omitted kinds (or a missing
	 * registry) default to `needsRegression: true`, preserving Phase A behavior.
	 */
	registry?: ObstacleKindRegistry;
}

export interface ObstacleValidationResult {
	ok: boolean;
	violations: ObstacleViolation[];
}

/**
 * The single integrity wall. Skill-agnostic.
 *
 * For each obstacle:
 *   - disputed / unresolved  -> require non-empty rationale (regardless of prior)
 *   - resolved               -> always accepted
 *   - active (only if priorPresent):
 *        * require a regression; if absent -> "missing_regression_metrics"
 *        * else require the regression to be proved by its values, else "no_regression"
 *        * then append the skill validator's own checks
 *
 * The regression check and the skill check are independent: both may fire for
 * the same obstacle (matching deep-interview's ambiguity + dimension checks).
 */
export function validateObstacles<TSkillCtx>(
	obstacles: ObstacleInput[],
	skillValidator: ObstacleValidator<TSkillCtx>,
	skillCtx: TSkillCtx,
	options: ObstacleValidationOptions,
): ObstacleValidationResult {
	const violations: ObstacleViolation[] = [];
	for (const obstacle of obstacles) {
		if (obstacle.status === "disputed" || obstacle.status === "unresolved") {
			if (!obstacle.rationale || obstacle.rationale.trim() === "") {
				violations.push({ code: "missing_rationale", kind: obstacle.kind, status: obstacle.status });
			}
			continue;
		}
		if (obstacle.status === "resolved") continue;
		if (!options.priorPresent) continue;
		const needsRegression = options.registry?.[obstacle.kind]?.needsRegression ?? true;
		if (needsRegression) {
			const regression = obstacle.regression;
			if (!regression) {
				violations.push({ code: "missing_regression_metrics", kind: obstacle.kind });
			} else {
				const proved =
					regression.direction === "unchanged-weak"
						? regression.newValue <= regression.priorValue
						: regression.direction === "rise"
							? regression.newValue > regression.priorValue
							: regression.newValue < regression.priorValue;
				if (!proved) {
					violations.push({
						code: "no_regression",
						kind: obstacle.kind,
						metric: regression.metric,
						priorValue: regression.priorValue,
						newValue: regression.newValue,
						direction: regression.direction,
					});
				}
			}
		}
		violations.push(...skillValidator.validateActive(obstacle, skillCtx));
	}
	return { ok: violations.length === 0, violations };
}
