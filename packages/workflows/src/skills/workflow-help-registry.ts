import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";
import { DEEP_INTERVIEW_SKILL_HELP } from "#workflows/skills/deep-interview/help";
import { RALPLAN_SKILL_HELP } from "#workflows/skills/ralplan/help";
import { TEAM_SKILL_HELP } from "#workflows/skills/team/help";
import { ULTRAGOAL_SKILL_HELP } from "#workflows/skills/ultragoal/help";
import type { WorkflowSkillHelp } from "#workflows/skills/workflow-help-types";

export const WORKFLOW_SKILL_HELP = {
	"deep-interview": DEEP_INTERVIEW_SKILL_HELP,
	ralplan: RALPLAN_SKILL_HELP,
	team: TEAM_SKILL_HELP,
	ultragoal: ULTRAGOAL_SKILL_HELP,
} as const satisfies Record<WorkflowSkill, WorkflowSkillHelp>;

export const PI_WORKFLOW_SKILLS = Object.keys(WORKFLOW_SKILL_HELP) as WorkflowSkill[];

export function getWorkflowSkillHelp(skill: WorkflowSkill): WorkflowSkillHelp {
	return WORKFLOW_SKILL_HELP[skill];
}

export function getWorkflowSkillCommandNames(skill: WorkflowSkill): string[] {
	return Object.keys(getWorkflowSkillHelp(skill).actions);
}

export function renderWorkflowCommandsReference(skill: WorkflowSkill): string {
	const help = getWorkflowSkillHelp(skill);
	const lines = [
		`# ${help.label} workflow commands`,
		"",
		'Use these commands with JSON objects passed through `--input` or `--input-file`. Every skill action requires the canonical `sessionId`; tools obtain it from the host session context. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.',
		"",
		"Command order for agents:",
		"",
		...help.commandOrder.map((line, index) => `${index + 1}. ${line}`),
		"",
		...help.referenceFooter,
	];
	return `${lines.join("\n")}\n`;
}
