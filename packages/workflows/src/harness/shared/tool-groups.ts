import type { WorkflowActiveState } from "./active-state.ts";
import type { WorkflowSkill } from "./paths.ts";

export type WorkflowToolGroup = WorkflowSkill | "subagent" | "harness";

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

export const WORKFLOW_TOOL_GROUPS: Record<WorkflowToolGroup, readonly string[]> = {
	"deep-interview": DEEP_INTERVIEW_TOOLS,
	ralplan: RALPLAN_TOOLS,
	team: TEAM_TOOLS,
	ultragoal: ULTRAGOAL_TOOLS,
	subagent: SUBAGENT_TOOLS,
	harness: HARNESS_TOOLS,
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

function workflowFromPrompt(prompt: string): WorkflowSkill | undefined {
	const match = prompt.match(/<skill\s+name="([^"]+)"/);
	const skill = match?.[1];
	return skill === "deep-interview" || skill === "ralplan" || skill === "team" || skill === "ultragoal"
		? skill
		: undefined;
}

function mostRecentActiveWorkflow(activeState: WorkflowActiveState | undefined): WorkflowSkill | undefined {
	const entries = activeState?.active_workflows?.filter((entry) => entry.active && !entry.stale) ?? [];
	if (entries.length === 0) return undefined;
	const [latest] = entries.slice().sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
	return latest?.skill;
}

export function resolveWorkflowToolGroup(input: {
	currentPromptText?: string;
	activeWorkflowState?: WorkflowActiveState;
}): WorkflowToolGroup | undefined {
	const promptGroup = input.currentPromptText ? workflowFromPrompt(input.currentPromptText) : undefined;
	if (promptGroup) return promptGroup;
	return mostRecentActiveWorkflow(input.activeWorkflowState);
}

export function selectWorkflowActiveTools(input: {
	currentActiveTools: readonly string[];
	selectedGroup?: WorkflowToolGroup;
	availableToolNames?: ReadonlySet<string>;
}): string[] {
	const availableToolNames = input.availableToolNames;
	const selectedWorkflowTools = input.selectedGroup ? WORKFLOW_TOOL_GROUPS[input.selectedGroup] : [];
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
