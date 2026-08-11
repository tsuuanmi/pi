import { createHash } from "node:crypto";
import type { WorkflowRuntimeReceipt } from "#workflows/runtime/types";

export interface ReceiptConsistencyCheck {
	valid: boolean;
	contradiction?: string;
}

export function workflowRuntimeReceiptHash(receipt: Omit<WorkflowRuntimeReceipt, "contentSha256">): string {
	return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

export function isWorkflowRuntimeReceiptValid(receipt: WorkflowRuntimeReceipt): boolean {
	const { contentSha256, ...fields } = receipt;
	return workflowRuntimeReceiptHash(fields) === contentSha256;
}

/** Validate lifecycle targets for accepted completion and validation receipts. */
export function validateReceiptFamilyConsistency(receipt: WorkflowRuntimeReceipt): ReceiptConsistencyCheck {
	if (receipt.verb === "finalize" && receipt.accepted && receipt.stateAfter?.lifecycle !== "completed") {
		return {
			valid: false,
			contradiction: `finalize-accepted-but-lifecycle-not-completed:${receipt.stateAfter?.lifecycle ?? "none"}`,
		};
	}
	const validationPassed =
		receipt.verb === "validate" &&
		receipt.accepted &&
		(receipt.evidence as { overallPassed?: unknown }).overallPassed === true;
	if (validationPassed && receipt.stateAfter?.lifecycle !== "validating") {
		return {
			valid: false,
			contradiction: `validate-passed-but-lifecycle-not-validating:${receipt.stateAfter?.lifecycle ?? "none"}`,
		};
	}
	return { valid: true };
}

export class ReceiptConsistencyError extends Error {
	readonly receiptId: string;
	readonly contradiction: string;

	constructor(receipt: WorkflowRuntimeReceipt, contradiction: string) {
		super(`receipt_consistency_error:${receipt.verb}:${receipt.receiptId}:${contradiction}`);
		this.name = "ReceiptConsistencyError";
		this.receiptId = receipt.receiptId;
		this.contradiction = contradiction;
	}
}
