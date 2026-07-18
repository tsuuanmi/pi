/**
 * Deterministic budget helpers for compact-state projections.
 *
 * Compact-state projections must be pure and deterministic: the same input
 * state always projects to the same compact state. The budget is a single axis
 * today (`lastN`), applied by projections that have a truncatable slice.
 */

/** Budget options a compact schema may apply during projection. */
export interface CompactBudget {
	/** Keep at most the last N items of a truncatable slice (e.g. recent rounds). */
	lastN?: number;
}
