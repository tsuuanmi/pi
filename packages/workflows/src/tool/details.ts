import { assembleFinalPackage, type WorkflowFinalPackage } from "#workflows/artifacts/final-package";

/** Model-visible workflow tool result details, not a durable receipt. */
export interface WorkflowToolDetails {
	ok: boolean;
	final_package: WorkflowFinalPackage;
	[key: string]: unknown;
}

export function workflowToolDetails(fields: Record<string, unknown> = {}): WorkflowToolDetails {
	return { ...fields, ok: true, final_package: assembleFinalPackage(fields) };
}
