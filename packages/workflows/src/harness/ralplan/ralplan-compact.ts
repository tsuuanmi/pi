import type { RalplanCompactStatus, RalplanStatus } from "./ralplan-runtime.ts";

/**
 * Pure projection from a full {@link RalplanStatus} to the prompt-efficient
 * {@link RalplanCompactStatus}. Deterministic and side-effect free: the same
 * status always projects to the same compact state. Separated from the I/O in
 * `readRalplanCompactStatus` so the projection can be registered in the shared
 * compact-state registry without coupling the registry to ralplan's I/O.
 */
export function projectRalplanCompact(status: RalplanStatus): RalplanCompactStatus {
	return {
		run_id: status.run_id,
		phase: typeof status.state?.current_phase === "string" ? status.state.current_phase : undefined,
		iteration: status.iteration,
		stages: status.stages,
		latest: status.latest
			? {
					stage: status.latest.stage,
					stage_n: status.latest.stage_n,
					path: status.latest.path,
					created_at: status.latest.created_at,
				}
			: undefined,
		pending_approval: status.pending_approval,
		pending_approval_path: status.pending_approval_path,
		invalid_index_line_count: status.invalid_index_lines.length,
	};
}
