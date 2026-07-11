import type { WorkflowActiveState } from "./active-state.ts";
import type { WorkflowSkill } from "./paths.ts";
import { isWorkflowSkill } from "./state-schema.ts";

export const DEEP_INTERVIEW_TOOLS = [
	"pi_workflow_state",
	"deep_interview_plan_question",
	"deep_interview_record_answer",
	"deep_interview_record_scoring",
	"deep_interview_read_compact",
	"deep_interview_closure_check",
	"deep_interview_restate_goal",
	"deep_interview_write_spec",
	"subagent_spawn",
	"subagent_await",
] as const;

export const RALPLAN_TOOLS = [
	"pi_workflow_state",
	"ralplan_record_explorer_gate",
	"ralplan_run_agent",
	"ralplan_status",
	"ralplan_read_compact",
	"ralplan_doctor",
	"ralplan_approve_plan",
	"ralplan_write_artifact",
] as const;

export const TEAM_TOOLS = [
	"pi_workflow_state",
	"team_start",
	"team_snapshot",
	"team_read_compact",
	"team_create_task",
	"team_transition_task",
	"team_send_message",
	"team_record_review_gate",
	"team_record_completion_gate",
	"team_complete",
	"team_spawn_task_agent",
] as const;

export const ULTRAGOAL_TOOLS = [
	"pi_workflow_state",
	"ultragoal_create_plan",
	"ultragoal_status",
	"ultragoal_read_compact",
	"ultragoal_start_next",
	"ultragoal_checkpoint",
	"ultragoal_record_review_blockers",
	"ultragoal_classify_blocker",
	"ultragoal_guard",
	"ultragoal_spawn_goal_agent",
] as const;

export const SUBAGENT_TOOLS = [
	"subagent_spawn",
	"subagent_status",
	"subagent_await",
	"subagent_steer",
	"subagent_pause",
	"subagent_resume",
	"subagent_cancel",
] as const;

export const HARNESS_TOOLS = ["fetch", "yield"] as const;

/**
 * Tools activated for each workflow skill while it is "in play". Subagent and
 * harness tools are cross-cutting (see `ALWAYS_AVAILABLE_TOOLS`) and are never
 * selected/pruned, so they are intentionally absent from this map.
 */
export const WORKFLOW_SKILL_TOOLS: Record<WorkflowSkill, readonly string[]> = {
	"deep-interview": DEEP_INTERVIEW_TOOLS,
	ralplan: RALPLAN_TOOLS,
	team: TEAM_TOOLS,
	ultragoal: ULTRAGOAL_TOOLS,
};

/**
 * Cross-cutting tools that stay always-available (never pruned) so workflows can
 * be started and so subagents / harness tools can be used outside any active
 * workflow:
 * - `pi_workflow_state` is needed to initialize any workflow.
 * - `SUBAGENT_TOOLS` are useful outside workflows (e.g. spawning a one-off agent).
 * - `HARNESS_TOOLS` (`fetch`, `yield`) are general-purpose.
 */
const ALWAYS_AVAILABLE_TOOLS = new Set<string>(["pi_workflow_state", ...SUBAGENT_TOOLS, ...HARNESS_TOOLS]);

/**
 * Tools that belong to a specific workflow skill and are pruned when that skill
 * is not the active workflow. Only the four skill groups (deep-interview,
 * ralplan, team, ultragoal) are prunable; cross-cutting tools (see
 * ALWAYS_AVAILABLE_TOOLS) stay available so workflows can be started and
 * subagents can be used with no active workflow.
 */
export const WORKFLOW_OWNED_TOOLS = new Set<string>(
	[...DEEP_INTERVIEW_TOOLS, ...RALPLAN_TOOLS, ...TEAM_TOOLS, ...ULTRAGOAL_TOOLS].filter(
		(name) => !ALWAYS_AVAILABLE_TOOLS.has(name),
	),
);

/**
 * Skills invoked in the current user turn via `<skill name="…">` (from `/skill:`
 * expansion). A skill invoked this turn is "in play" even before any workflow
 * state exists, so its tools are available to start the workflow.
 */
function skillsFromPrompt(prompt: string): WorkflowSkill[] {
	const match = prompt.match(/<skill\s+name="([^"]+)"/);
	const skill = match?.[1];
	return skill && isWorkflowSkill(skill) ? [skill] : [];
}

/**
 * Skills with an active (non-cleared) workflow entry. Staleness is a HUD
 * concern, not an availability concern: an idle workflow keeps its tools so it
 * can be resumed. Inactive entries (e.g. a skill that handed off) are excluded.
 */
function activeWorkflowSkills(activeState: WorkflowActiveState | undefined): WorkflowSkill[] {
	const entries = activeState?.active_workflows ?? [];
	return entries.filter((entry) => entry.active).map((entry) => entry.skill);
}

/**
 * Resolve the workflow skills currently "in play": the union of any skill
 * invoked this turn and every skill with an active workflow. Tool availability
 * follows this set (see `selectWorkflowActiveTools`): a skill's tools stay
 * active while it is in play, so workflows can be started, continued, and
 * resumed (even after going idle) without "tool not found" errors.
 */
export function resolveActiveWorkflowSkills(input: {
	currentPromptText?: string;
	activeWorkflowState?: WorkflowActiveState;
}): WorkflowSkill[] {
	const skills = new Set<WorkflowSkill>();
	for (const skill of skillsFromPrompt(input.currentPromptText ?? "")) skills.add(skill);
	for (const skill of activeWorkflowSkills(input.activeWorkflowState)) skills.add(skill);
	return [...skills];
}

export function selectWorkflowActiveTools(input: {
	currentActiveTools: readonly string[];
	selectedSkills?: readonly WorkflowSkill[];
	availableToolNames?: ReadonlySet<string>;
}): string[] {
	const availableToolNames = input.availableToolNames;
	const skillSet = new Set(input.selectedSkills ?? []);
	const selectedWorkflowTools = new Set<string>();
	for (const skill of skillSet) {
		for (const name of WORKFLOW_SKILL_TOOLS[skill]) selectedWorkflowTools.add(name);
	}
	const next = input.currentActiveTools.filter((name) => !WORKFLOW_OWNED_TOOLS.has(name));
	for (const name of selectedWorkflowTools) {
		if (!availableToolNames || availableToolNames.has(name)) {
			next.push(name);
		}
	}
	return [...new Set(next)];
}

export function sameToolSet(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const left = [...a].sort();
	const right = [...b].sort();
	return left.every((value, index) => value === right[index]);
}
