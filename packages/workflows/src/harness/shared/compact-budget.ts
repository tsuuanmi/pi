/**
 * Deterministic budget helpers for compact-state projections.
 *
 * Compact-state projections must be pure and deterministic: the same input
 * state always projects to the same compact state, and the same compact state
 * always falls in the same size class. These helpers enforce deterministic
 * truncation (no LLM, no summarization) so an over-budget projection degrades
 * to a stable suffix rather than a nondeterministic summary.
 */

/** Budget options a compact schema may apply during projection. */
export interface CompactBudget {
	/** Keep at most the last N items of a truncatable slice (e.g. recent rounds). */
	lastN?: number;
}

/**
 * Return a copy of `values`, truncated to the last `lastN` items.
 * Deterministic: `lastN` undefined/NaN/negative => full copy; `0` => empty.
 * Never mutates the input.
 */
export function truncateLastN<T>(values: readonly T[], lastN?: number): T[] {
	if (lastN === undefined || !Number.isFinite(lastN) || lastN < 0) return [...values];
	if (lastN === 0) return [];
	return values.slice(-Math.floor(lastN));
}

/**
 * Deterministic byte-size estimate of a projected compact state (JSON-encoded
 * UTF-8 length). Same input => same size class. Used to assert budget behavior
 * and to gate deterministic truncation without an LLM.
 */
export function estimateCompactBytes(value: unknown): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).byteLength;
	} catch {
		return 0;
	}
}
