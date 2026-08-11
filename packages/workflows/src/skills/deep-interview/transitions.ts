import {
	type ObstacleInput,
	type ObstacleValidator,
	type ObstacleViolation,
	validateObstacles,
} from "#workflows/audit/decision-ledger";
import type {
	DeepInterviewRoundRecord,
	DeepInterviewTriggerMetadata,
	TransitionValidationResult,
} from "#workflows/skills/deep-interview/types";

interface DeepInterviewDimensionContext {
	priorScores?: Record<string, number>;
	nextScores?: Record<string, number>;
}

const deepInterviewObstacleValidator: ObstacleValidator<DeepInterviewDimensionContext> = {
	validateActive(obstacle, { priorScores, nextScores }) {
		const violations: ObstacleViolation[] = [];
		const dimension = obstacle.scope?.dimension;
		if (dimension === undefined) return violations;
		const priorDim = priorScores?.[dimension];
		const nextDim = nextScores?.[dimension];
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
	const triggers = next.triggers === undefined ? [] : next.triggers;
	const { obstacles, skillCtx } = mapDeepInterviewTriggersToObstacles(triggers, prior, next);
	const result = validateObstacles(obstacles, deepInterviewObstacleValidator, skillCtx, {
		priorPresent: prior !== undefined,
	});
	return { ok: result.ok, violations: formatDeepInterviewViolations(result.violations) };
}
