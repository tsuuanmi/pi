import { getWorkflowSkillCommandNames } from "#workflows/skills/workflow-help-registry";
import type { WorkflowSkillSurface } from "#workflows/skills/workflow-surface-types";

const commandNames = getWorkflowSkillCommandNames("deep-interview");

export const DEEP_INTERVIEW_SURFACE: WorkflowSkillSurface = {
	skill: "deep-interview",
	commands: commandNames.map((commandName) => ({
		skill: "deep-interview",
		commandName,
	})),
	tools: [
		{ skill: "deep-interview", toolName: "deep_interview_plan_question" },
		{ skill: "deep-interview", toolName: "deep_interview_record_answer" },
		{ skill: "deep-interview", toolName: "deep_interview_record_scoring" },
		{ skill: "deep-interview", toolName: "deep_interview_read_compact" },
		{ skill: "deep-interview", toolName: "deep_interview_closure_check" },
		{ skill: "deep-interview", toolName: "deep_interview_restate_goal" },
		{ skill: "deep-interview", toolName: "deep_interview_write_spec" },
	],
};
