/**
 * Shared, pluggable compact-state registry and deterministic budget helpers.
 *
 * Compact-state projections must be pure and deterministic: the same input
 * state always projects to the same compact state. The budget is a single axis
 * today (`lastN`), applied by projections that have a truncatable slice.
 *
 * Each workflow skill registers its own pure compact-projection schema here.
 * `projectCompactStateFor(skill, input, budget?)` dispatches to the registered
 * schema. The dispatcher is shape-agnostic (each skill's `input` is its own
 * type) — there is no lowest-common-denominator projection, so a skill keeps
 * its rich compact shape (deep-interview keeps topology/rounds/ambiguity;
 * ralplan/team/ultragoal keep theirs). Adding a skill = registering a schema;
 * no core change.
 *
 * Cycle-free by construction: this module imports only the per-skill *pure*
 * projection modules (leaves), which do not import this registry. The skill
 * runtime readers import this dispatcher; the pure projections do not.
 */

import { projectCompactState } from "#workflows/skills/deep-interview/deep-interview-state";
import { projectRalplanCompact } from "#workflows/skills/ralplan/ralplan-compact";
import type { RalplanStatus } from "#workflows/skills/ralplan/ralplan-runtime";
import { projectTeamCompact, type TeamCompactInput } from "#workflows/skills/team/team-compact";
import { projectUltragoalCompact, type UltragoalCompactInput } from "#workflows/skills/ultragoal/ultragoal-compact";

/** Budget options a compact schema may apply during projection. */
export interface CompactBudget {
	/** Keep at most the last N items of a truncatable slice (e.g. recent rounds). */
	lastN?: number;
}

export type CompactSkill = "deep-interview" | "ralplan" | "ultragoal" | "team";

/** A registered compact projection: a pure function over a skill-specific input. */
export interface CompactSchema {
	project: (input: unknown, budget?: CompactBudget) => unknown;
}

const REGISTRY = new Map<CompactSkill, CompactSchema>();

/** Register (or replace) a skill's compact projection schema. */
export function registerCompactSchema(skill: CompactSkill, schema: CompactSchema): void {
	REGISTRY.set(skill, schema);
}

/** Whether a compact projection schema is registered for `skill`. */
export function hasCompactSchema(skill: CompactSkill): boolean {
	return REGISTRY.has(skill);
}

/**
 * Dispatch to the registered compact projection for `skill`. Throws if no
 * schema is registered (fail-closed) so a misconfigured skill surfaces
 * immediately rather than silently projecting to nothing.
 *
 * Generic at the call site so a reader can preserve its concrete return type:
 * `projectCompactStateFor<RalplanCompactStatus>("ralplan", status)`.
 */
export function projectCompactStateFor<T = unknown>(skill: CompactSkill, input: unknown, budget?: CompactBudget): T {
	const schema = REGISTRY.get(skill);
	if (!schema) {
		throw new Error(`no compact schema registered for skill: ${skill}`);
	}
	return schema.project(input, budget) as T;
}

/** Test-only: clear the registry so a test can register in isolation. */
export function resetCompactSchemaRegistry(): void {
	REGISTRY.clear();
}

// Eager registration of the four workflow skills' compact projections.
registerCompactSchema("deep-interview", {
	project: (input, budget) => projectCompactState(input, { lastN: budget?.lastN }),
});
registerCompactSchema("ralplan", {
	project: (input) => projectRalplanCompact(input as RalplanStatus),
});
registerCompactSchema("ultragoal", {
	project: (input) => projectUltragoalCompact(input as UltragoalCompactInput),
});
registerCompactSchema("team", {
	project: (input) => projectTeamCompact(input as TeamCompactInput),
});
