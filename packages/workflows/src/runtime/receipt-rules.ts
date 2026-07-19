/** Receipt lifecycle-target consistency guard (Phase 3).
 *
 * Rejects receipts whose post-state lifecycle contradicts their family's lifecycle target — e.g.
 * a `finalize` receipt that is `accepted` but whose `stateAfter.lifecycle` is not `completed`, or a
 * passing `validate` receipt that does not land on `validating`. Pi's "family" is the receipt verb.
 *
 * WRITE-PATH GUARD ONLY. This is enforced inside `mutateRuntimeSession` AFTER the in-memory receipt
 * is constructed and BEFORE any event/receipt/state write, so a contradiction throws with zero
 * orphan writes. Pre-Phase-3 receipts are GRANDFATHERED and NOT re-validated on read; no backfill is
 * performed and rollback needs no migration.
 *
 * The rule set is PLUGGABLE via {@link receiptFamilyConsistencyRules}: future receipt families add
 * their own rules without touching `mutateRuntimeSession`. The default set is conservative — only
 * `finalize(accepted)` and `validate(overallPassed)` are gated; blocked variants are OUT of target
 * (predicate-gated) so Phase 1/2 behavior is not falsely rejected. */
import type { HarnessLifecycle, HarnessVerb, RuntimeReceipt } from "#workflows/runtime/types";

/** The post-state lifecycle a receipt of a given verb MUST land on when its acceptance predicate
 * matches. Only `finalize` and `validate` are gated here; ungated verbs always pass. */
export const RECEIPT_FAMILY_LIFECYCLE_TARGETS: Partial<Record<HarnessVerb, HarnessLifecycle>> = {
	finalize: "completed",
	validate: "validating",
};

/** A pluggable consistency rule for a receipt family. `matches` selects which receipts the rule
 * applies to; `enforce` returns `null` when consistent or a `contradiction` reason otherwise. */
export interface ReceiptFamilyConsistencyRule {
	matches(receipt: RuntimeReceipt): boolean;
	enforce(receipt: RuntimeReceipt): string | null;
}

function isFinalizeAccepted(receipt: RuntimeReceipt): boolean {
	return receipt.verb === "finalize" && receipt.accepted;
}

function isValidateOverallPassed(receipt: RuntimeReceipt): boolean {
	if (receipt.verb !== "validate" || !receipt.accepted) return false;
	return (receipt.evidence as { overallPassed?: unknown }).overallPassed === true;
}

const FINALIZE_RULE: ReceiptFamilyConsistencyRule = {
	matches: isFinalizeAccepted,
	enforce: (receipt) =>
		receipt.stateAfter?.lifecycle === "completed"
			? null
			: `finalize-accepted-but-lifecycle-not-completed:${receipt.stateAfter?.lifecycle ?? "none"}`,
};

const VALIDATE_RULE: ReceiptFamilyConsistencyRule = {
	matches: isValidateOverallPassed,
	enforce: (receipt) =>
		receipt.stateAfter?.lifecycle === "validating"
			? null
			: `validate-passed-but-lifecycle-not-validating:${receipt.stateAfter?.lifecycle ?? "none"}`,
};

/** Pluggable family-consistency map. Future receipt families register rules here without touching
 * {@link validateReceiptFamilyConsistency} or `mutateRuntimeSession`. */
export const receiptFamilyConsistencyRules: ReceiptFamilyConsistencyRule[] = [FINALIZE_RULE, VALIDATE_RULE];

/** Result of a consistency check: `valid` with no `contradiction`, or `valid:false` + reason. */
export interface ReceiptConsistencyCheck {
	valid: boolean;
	contradiction?: string;
}

/** Validate a receipt against every matching rule. Returns `{ valid: true }` for receipts outside
 * the target set (blocked variants, ungated verbs) so Phase 1/2 behavior is preserved. */
export function validateReceiptFamilyConsistency(receipt: RuntimeReceipt): ReceiptConsistencyCheck {
	for (const rule of receiptFamilyConsistencyRules) {
		if (!rule.matches(receipt)) continue;
		const contradiction = rule.enforce(receipt);
		if (contradiction) return { valid: false, contradiction };
	}
	return { valid: true };
}

/** Typed error thrown when a receipt contradicts its family's lifecycle target. Carries the
 * offending receipt id + contradiction so callers surface a precise failure. */
export class ReceiptConsistencyError extends Error {
	readonly receiptId: string;
	readonly contradiction: string;
	constructor(receipt: RuntimeReceipt, contradiction: string) {
		super(`receipt_consistency_error:${receipt.verb}:${receipt.receiptId}:${contradiction}`);
		this.name = "ReceiptConsistencyError";
		this.receiptId = receipt.receiptId;
		this.contradiction = contradiction;
	}
}
