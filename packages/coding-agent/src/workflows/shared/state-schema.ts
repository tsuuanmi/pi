import type { RalplanStage, WorkflowSkill } from "./paths.ts";

const WORKFLOW_STATE_VERSION = 1;

export interface WorkflowStateEnvelope {
	skill: WorkflowSkill;
	version: number;
	active: boolean;
	current_phase: string;
	updated_at: string;
	[key: string]: unknown;
}

const WORKFLOW_SKILLS = new Set<string>(["deep-interview", "ralplan", "team", "ultragoal"]);
const RALPLAN_STAGES = new Set<string>(["planner", "architect", "critic", "revision", "adr", "final"]);

export function isWorkflowSkill(value: string): value is WorkflowSkill {
	return WORKFLOW_SKILLS.has(value);
}

export function assertWorkflowSkill(value: string): asserts value is WorkflowSkill {
	if (!isWorkflowSkill(value)) throw new Error(`unknown workflow skill: ${value}`);
}

function isRalplanStage(value: string): value is RalplanStage {
	return RALPLAN_STAGES.has(value);
}

export function assertRalplanStage(value: string): asserts value is RalplanStage {
	if (!isRalplanStage(value)) throw new Error(`unknown ralplan stage: ${value}`);
}

const PATH_COMPONENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;

export function assertSafePathComponent(value: string, label: string): void {
	if (!PATH_COMPONENT_RE.test(value) || value.includes("..")) {
		throw new Error(`invalid ${label}: ${value}`);
	}
}

export function coerceWorkflowState(
	skill: WorkflowSkill,
	existing: Record<string, unknown>,
	patch: Record<string, unknown>,
	nowIso: string,
): WorkflowStateEnvelope {
	return {
		...existing,
		...patch,
		skill,
		version: WORKFLOW_STATE_VERSION,
		active: typeof patch.active === "boolean" ? patch.active : existing.active !== false,
		current_phase:
			typeof patch.current_phase === "string"
				? patch.current_phase
				: typeof existing.current_phase === "string"
					? existing.current_phase
					: "active",
		updated_at: nowIso,
	};
}
