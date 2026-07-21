import { type StructuredReceipt, withStructuredReceipt } from "@tsuuanmi/pi-agent";
import { type WorkflowWriteOptions, type WriteArtifactResult, writeTextArtifact } from "#workflows/state/state-writer";

export interface StageArtifactInput {
	path: string;
	content: string;
}

/**
 * Shared deterministic stage-artifact writer. It intentionally delegates to the
 * existing atomic text writer so package-specific artifact helpers keep their
 * current durability and path-safety behavior.
 */
export async function writeStageArtifact(
	input: StageArtifactInput,
	options: WorkflowWriteOptions = {},
): Promise<WriteArtifactResult> {
	return writeTextArtifact(input.path, input.content, options);
}

export interface WorkflowFinalPackage {
	report?: unknown;
	changelog?: unknown;
	handoff?: unknown;
}

export interface WorkflowReceipt {
	ok: boolean;
	final_package?: WorkflowFinalPackage;
	[key: string]: unknown;
}

function pickPackageSection(state: Record<string, unknown>, keys: readonly string[]): unknown {
	for (const key of keys) {
		const value = state[key];
		if (value !== undefined) return value;
	}
	return null;
}

/** Pure deterministic final package assembly: report + changelog + handoff. */
export function assembleFinalPackage(state: Record<string, unknown>): WorkflowFinalPackage {
	return {
		report: pickPackageSection(state, ["report", "final_report", "summary"]),
		changelog: pickPackageSection(state, ["changelog", "change_log", "changes"]),
		handoff: pickPackageSection(state, ["handoff", "handoff_summary", "handoff_patch"]),
	};
}

export function workflowReceipt(fields: Record<string, unknown> = {}): WorkflowReceipt {
	return { ok: true, final_package: assembleFinalPackage(fields), ...fields };
}

export function workflowReceiptWithStructuredReceipt(
	fields: Record<string, unknown> = {},
	receipt?: StructuredReceipt,
): WorkflowReceipt {
	return receipt ? workflowReceipt(withStructuredReceipt(fields, receipt)) : workflowReceipt(fields);
}
