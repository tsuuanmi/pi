/**
 * Vanish receipt family (Phase 2 fail-closed data-loss gate).
 *
 * A `vanish` receipt is a `RuntimeReceipt` (verb `"vanish"`) whose `evidence` is a
 * `VanishEvidence`. Every destructive recovery classification requires a valid vanish receipt
 * written + re-read + revalidated from disk BEFORE the destructive action proceeds; an invalid
 * or missing vanish receipt blocks recovery immediately and never proceeds.
 *
 * Vanish is internal-only: written by `recoverPrimitive` / the `operate` loop before destructive
 * actions, never exposed as a standalone CLI verb.
 */
import type { PreserveResult, UntrackedEntry } from "./preservation.ts";
import type { GitDelta } from "./types.ts";

/** Classifications that require a vanish receipt before any destructive action. */
export type VanishClassification = "restart-clean" | "restart-preserve-delta" | "fallback-harness-exec";

export interface VanishEvidence extends Record<string, unknown> {
	schemaVersion: 1;
	verb: "vanish";
	classification: VanishClassification;
	gitDelta: GitDelta;
	gitStatusPorcelain: string;
	untrackedManifest: UntrackedEntry[];
	preservation: "snapshot" | "stash";
	stashRef: string | null;
	snapshotComplete: boolean;
	forbiddenActions: string[];
}

const VANISH_CLASSIFICATIONS: ReadonlySet<VanishClassification> = new Set([
	"restart-clean",
	"restart-preserve-delta",
	"fallback-harness-exec",
]);

/** True iff the classification requires a vanish receipt before acting. */
export function requiresVanishBeforeAction(classification: string): classification is VanishClassification {
	return VANISH_CLASSIFICATIONS.has(classification as VanishClassification);
}

export interface VanishValidation {
	valid: boolean;
	reason?: string;
}

/**
 * Fail-closed validation of a vanish receipt's evidence. Invalid evidence must block recovery.
 *
 * Invariants enforced:
 *   - classification is a known destructive kind;
 *   - dirty deltas are preserved (never clean-restarted): a dirty gitDelta must carry a stash
 *     ref AND forbid `restart-clean`/`delete`/`reset`;
 *   - `stash` preservation requires a stash ref; `snapshot` preservation requires
 *     `snapshotComplete`;
 *   - snapshotComplete must be true (every dirty component captured).
 */
export function validateVanish(evidence: unknown): VanishValidation {
	if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
		return { valid: false, reason: "vanish-evidence-missing" };
	}
	const e = evidence as Record<string, unknown>;
	const classification = e.classification;
	if (typeof classification !== "string" || !requiresVanishBeforeAction(classification)) {
		return { valid: false, reason: "vanish-unknown-classification" };
	}
	const gitDelta = e.gitDelta;
	if (typeof gitDelta !== "string" || (gitDelta !== "clean" && gitDelta !== "dirty" && gitDelta !== "zero-delta")) {
		return { valid: false, reason: "vanish-invalid-gitDelta" };
	}
	const snapshotComplete = e.snapshotComplete;
	if (snapshotComplete !== true) {
		return { valid: false, reason: "vanish-snapshot-incomplete" };
	}
	const preservation = e.preservation;
	if (preservation !== "snapshot" && preservation !== "stash") {
		return { valid: false, reason: "vanish-invalid-preservation" };
	}
	const stashRef = e.stashRef;
	if (preservation === "stash" && (typeof stashRef !== "string" || stashRef.length === 0)) {
		return { valid: false, reason: "vanish-stash-missing-ref" };
	}
	const forbiddenActions = e.forbiddenActions;
	if (!Array.isArray(forbiddenActions)) {
		return { valid: false, reason: "vanish-forbidden-actions-missing" };
	}
	// Dirty deltas must be preserved, never clean-restarted, and must explicitly forbid the
	// destructive actions (restart-clean/delete/reset). All three are required (Gajae-style
	// defense-in-depth): a tampered receipt that keeps `restart-clean` but drops `delete`/`reset`
	// must still fail closed. `buildVanishEvidence` always emits all three for dirty deltas.
	if (gitDelta === "dirty") {
		if (classification === "restart-clean") {
			return { valid: false, reason: "vanish-dirty-never-clean-restarted" };
		}
		for (const action of ["restart-clean", "delete", "reset"]) {
			if (!forbiddenActions.includes(action)) {
				return { valid: false, reason: `vanish-dirty-missing-forbidden:${action}` };
			}
		}
		if (preservation !== "stash" || typeof stashRef !== "string" || stashRef.length === 0) {
			return { valid: false, reason: "vanish-dirty-requires-stash" };
		}
	}
	return { valid: true };
}

/**
 * Build uniform vanish evidence for any destructive classification. Dirty deltas carry real
 * preservation evidence (stash ref + manifest); clean/zero-delta/fallback carry empty preservation
 * evidence (nothing to preserve). Operates on `RuntimeReceipt.evidence` directly.
 */
export function buildVanishEvidence(
	gitDelta: GitDelta,
	preserve: PreserveResult,
	classification: VanishClassification,
): VanishEvidence {
	const dirty = gitDelta === "dirty";
	if (dirty) {
		const gitStatusPorcelain = `tracked-diff-sha:${preserve.trackedDiffSha256};untracked:${preserve.untrackedManifest.length};stash:${preserve.stashRef ?? "none"}`;
		return {
			schemaVersion: 1,
			verb: "vanish",
			classification,
			gitDelta,
			gitStatusPorcelain,
			untrackedManifest: preserve.untrackedManifest,
			preservation: preserve.stashRef ? "stash" : "snapshot",
			stashRef: preserve.stashRef,
			snapshotComplete: preserve.snapshotComplete,
			forbiddenActions: ["restart-clean", "delete", "reset"],
		};
	}
	// clean / zero-delta / fallback-harness-exec: nothing to preserve.
	return {
		schemaVersion: 1,
		verb: "vanish",
		classification,
		gitDelta,
		gitStatusPorcelain: `tracked-diff-sha:${preserve.trackedDiffSha256};untracked:0;stash:none`,
		untrackedManifest: [],
		preservation: "snapshot",
		stashRef: null,
		snapshotComplete: true,
		forbiddenActions: [],
	};
}
