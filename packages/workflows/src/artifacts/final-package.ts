export interface WorkflowFinalPackage {
	report: unknown;
	changelog: unknown;
	handoff: unknown;
}

/** Assemble the canonical report, changelog, and handoff package. */
export function assembleFinalPackage(state: Record<string, unknown>): WorkflowFinalPackage {
	return {
		report: state.report ?? null,
		changelog: state.changelog ?? null,
		handoff: state.handoff ?? null,
	};
}
