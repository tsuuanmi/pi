import type { WorkflowTypedArg } from "#workflows/registry/workflow-manifest-types";
import type { WorkflowSkill } from "#workflows/session/paths";

export type { WorkflowTypedArg } from "#workflows/registry/workflow-manifest-types";

export interface WorkflowActionHelp {
	summary: string;
	when: string;
	input: readonly string[];
	example: string;
}

export interface WorkflowSkillHelp {
	skill: WorkflowSkill;
	label: string;
	docs: readonly string[];
	commandOrder: readonly string[];
	referenceFooter: readonly string[];
	agentFlow: readonly string[];
	actions: Readonly<Record<string, WorkflowActionHelp>>;
	typedArgs: readonly WorkflowTypedArg[];
}
