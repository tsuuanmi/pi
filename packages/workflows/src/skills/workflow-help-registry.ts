import type { WorkflowSkill } from "#workflows/session/paths";
import { DEEP_INTERVIEW_SKILL_HELP } from "#workflows/skills/deep-interview/deep-interview-help";
import { RALPLAN_SKILL_HELP } from "#workflows/skills/ralplan/ralplan-help";
import { TEAM_SKILL_HELP } from "#workflows/skills/team/team-help";
import { ULTRAGOAL_SKILL_HELP } from "#workflows/skills/ultragoal/ultragoal-help";
import type { WorkflowSkillHelp, WorkflowTypedArg } from "#workflows/skills/workflow-help-types";

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

export function typedArgsForWorkflowVerb(skill: WorkflowSkill, verb: string): WorkflowTypedArg[] {
	return getWorkflowSkillHelp(skill).typedArgs.filter(
		(arg) => arg.appliesToVerbs === undefined || arg.appliesToVerbs.includes(verb),
	);
}

export function renderWorkflowCommandsReference(skill: WorkflowSkill): string {
	const help = getWorkflowSkillHelp(skill);
	const lines = [
		`# ${help.label} workflow commands`,
		"",
		'Use these commands with `--input` JSON objects. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.',
		"",
		"Command order for agents:",
		"",
		...help.commandOrder.map((line, index) => `${index + 1}. ${line}`),
		"",
		...help.referenceFooter,
	];
	return `${lines.join("\n")}\n`;
}

export function renderWorkflowSkillHelp(skill: WorkflowSkill): string {
	const help = getWorkflowSkillHelp(skill);
	const commandNames = getWorkflowSkillCommandNames(skill);
	const skillActions = commandNames
		.map((verb) => {
			const action = help.actions[verb];
			return `  ${verb.padEnd(24)} ${action?.summary ?? "Run this skill action."}`;
		})
		.join("\n");
	const actionDetails = commandNames
		.map((verb) => {
			const action = help.actions[verb];
			if (!action) return `  ${verb}\n    Parameters: see implementation.`;
			const input = action.input.map((line) => `    - ${line}`).join("\n");
			return `  ${verb}\n    What: ${action.summary}\n    When: ${action.when}\n    Parameters:\n${input}\n    Example: ${action.example}`;
		})
		.join("\n\n");
	const docs = help.docs.map((doc) => `  - ${doc}`).join("\n");
	return `Usage:\n  pi workflow ${help.skill} <action> [--input '{...}' | --input-file ./payload.json] [--json]\n\n${help.label} agent flow:\n${help.agentFlow.map((step, index) => `  ${index + 1}. ${step}`).join("\n")}\n\n${help.label} actions:\n${skillActions}\n\nAction details and parameters:\n${actionDetails}\n\nInput rules:\n  - Commands accept a JSON object with --input or --input-file.\n  - Pass sessionId from the current interactive/runtime session; do not rely on fallback environment state in agents.\n  - Use pi workflow state ${help.skill} read|write|clear|handoff|doctor for envelope state; use the action commands below for workflow-safe merges.\n\nDocs:\n${docs}\n`;
}
