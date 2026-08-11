import { mergeDeepInterviewEnvelope } from "#workflows/skills/deep-interview/envelope";
import {
	persistDeepInterviewEnvelope,
	readDeepInterviewEnvelope,
	readRounds,
} from "#workflows/skills/deep-interview/store";
import type {
	DeepInterviewEstablishedFact,
	DeepInterviewStateEnvelope,
	DeepInterviewTriggerMetadata,
} from "#workflows/skills/deep-interview/types";

export async function runClosureCheckForSession(cwd: string, sessionId: string): Promise<ClosureResult> {
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	return runClosureAcceptanceGuard(envelope);
}

// ---------------------------------------------------------------------------
// Closure/Acceptance Guard + Restate-Goal Gate (Step 4)
// ---------------------------------------------------------------------------

export interface ClosureResult {
	ok: boolean;
	gaps: string[];
}

/**
 * Closure acceptance guard for deep-interview.
 *
 * For each active (non-deferred) topology component, check the dimensions
 * {goal, constraints, criteria} (+ context when brownfield). A dimension is
 * covered if either (i) a matching established_facts entry exists, or (ii) a
 * scored round has a finite scores[dimension] at or above the coverage floor.
 * An unresolved or disputed trigger on a material path blocks closure regardless
 * of coverage.
 */
export function runClosureAcceptanceGuard(envelope: DeepInterviewStateEnvelope): ClosureResult {
	if (!envelope.state) throw new Error("deep-interview closure requires envelope.state");
	const inner = envelope.state as Record<string, unknown>;
	const established = inner.established_facts as DeepInterviewEstablishedFact[];
	const scoredRounds = readRounds(envelope).filter((round) => round.lifecycle === "scored");

	// Check for unresolved/disputed triggers on material paths
	const unresolvedTriggers: DeepInterviewTriggerMetadata[] = [];
	for (const round of scoredRounds) {
		for (const trigger of round.triggers ?? []) {
			if (trigger.status === "unresolved" || trigger.status === "disputed") {
				unresolvedTriggers.push(trigger);
			}
		}
	}

	const gaps: string[] = [];

	// Unresolved/disputed triggers block closure
	for (const trigger of unresolvedTriggers) {
		gaps.push(
			`unresolved ${trigger.status} trigger ${trigger.kind} on ${trigger.component}/${trigger.dimension}: ${trigger.rationale}`,
		);
	}

	const coverageFloor = 0.75;
	// Get active (non-deferred) components
	const topology = inner.topology as
		| { components?: Array<{ id?: string; status?: string; name?: string; dimensions?: string[] }> }
		| undefined;
	const isBrownfield = inner.type === "brownfield";
	const dimensions = ["goal", "constraints", "criteria"];
	if (isBrownfield) dimensions.push("context");

	if (!topology || !Array.isArray(topology.components)) {
		gaps.push("topology: components are required before closure");
		return { ok: false, gaps };
	}
	const activeComponents = topology.components.filter((component) => component.status !== "deferred");
	if (activeComponents.length === 0) {
		gaps.push("topology: at least one active component is required");
		return { ok: false, gaps };
	}

	for (const component of activeComponents) {
		if (!component.id || !component.name) {
			gaps.push("topology: active component requires an id and name");
			continue;
		}
		const componentName = component.name;
		const componentKeys = new Set([component.id, component.name]);
		const matchesComponent = (value: string | undefined): boolean => value !== undefined && componentKeys.has(value);
		for (const dimension of dimensions) {
			// Check (i): matching established_facts entry
			const hasFact = established.some(
				(fact) => !fact.disputed && matchesComponent(fact.component) && fact.dimension === dimension,
			);

			// Check (ii): scored round with finite score for this dimension at a useful coverage floor
			const hasScoredRound = scoredRounds.some(
				(r) =>
					r.scores &&
					typeof r.scores[dimension] === "number" &&
					Number.isFinite(r.scores[dimension] as number) &&
					(r.scores[dimension] as number) >= coverageFloor &&
					matchesComponent(r.component),
			);

			if (!hasFact && !hasScoredRound) {
				gaps.push(`${componentName}/${dimension}: no established fact or scored round >= ${coverageFloor}`);
			}
		}
	}

	return { ok: gaps.length === 0, gaps };
}

export interface RestateGoalInput {
	restatedGoal: string;
	confirm: "Yes" | "Adjust" | "Missing";
	adjustment?: string;
}

/**
 * Restate-goal gate: collapse agreed answers into a one-sentence goal covering
 * every active component. Confirm (Yes crystallizes), Adjust (re-score), or
 * Missing (add scope). Caps at two loops.
 */
export async function restateGoalGate(
	cwd: string,
	input: RestateGoalInput,
	sessionId: string,
): Promise<{ ok: boolean; restated_goal?: string; loops_remaining: number }> {
	if (!input.restatedGoal || input.restatedGoal.trim() !== input.restatedGoal) {
		throw new Error("deep-interview restated goal must be a non-empty, trimmed string");
	}
	if ((input.confirm === "Adjust" || input.confirm === "Missing") && !input.adjustment?.trim()) {
		throw new Error(`deep-interview ${input.confirm.toLowerCase()} requires an adjustment`);
	}
	const envelope = await readDeepInterviewEnvelope(cwd, sessionId);
	if (!envelope.state) throw new Error("deep-interview restate requires envelope.state");
	const inner = envelope.state as Record<string, unknown>;
	let currentLoops = 0;
	if (inner.restate_loops !== undefined) {
		if (!Number.isInteger(inner.restate_loops) || (inner.restate_loops as number) < 0) {
			throw new Error("deep-interview state.restate_loops must be a non-negative integer");
		}
		currentLoops = inner.restate_loops as number;
	}
	if (currentLoops >= 2) {
		return { ok: false, loops_remaining: 0 };
	}

	if (input.confirm === "Yes") {
		const next = mergeDeepInterviewEnvelope(envelope, {
			restated_goal: input.restatedGoal,
		});
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview restate-goal", sessionId);
		return { ok: true, restated_goal: input.restatedGoal, loops_remaining: 2 - currentLoops - 1 };
	}

	if (input.confirm === "Adjust" || input.confirm === "Missing") {
		if (envelope.closure_overrides !== undefined && !Array.isArray(envelope.closure_overrides)) {
			throw new Error("deep-interview closure_overrides must be an array");
		}
		const closureOverrides = envelope.closure_overrides === undefined ? [] : [...envelope.closure_overrides];
		closureOverrides.push(`${input.confirm}: ${input.adjustment}`);
		const next = mergeDeepInterviewEnvelope(envelope, {
			restated_goal: input.restatedGoal,
			closure_overrides: closureOverrides,
			state: { restate_loops: currentLoops + 1 },
		});
		await persistDeepInterviewEnvelope(cwd, next, "pi deep-interview restate-goal", sessionId);
		return { ok: false, restated_goal: input.restatedGoal, loops_remaining: 2 - currentLoops - 1 };
	}

	throw new Error(`unknown deep-interview restate confirmation: ${input.confirm}`);
}
