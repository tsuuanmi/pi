export type {
	WorkflowManifest,
	WorkflowRetentionPolicy,
	WorkflowRuntimeManifest,
	WorkflowStateOperation,
	WorkflowStateValidationContext,
	WorkflowTransition,
	WorkflowTypedArg,
	WorkflowVerb,
} from "#workflows/registry/workflow-manifest-types";

import type {
	WorkflowManifest,
	WorkflowSkill,
	WorkflowTypedArg,
	WorkflowVerb,
} from "#workflows/registry/workflow-manifest-types";
import {
	getWorkflowRuntimeManifest,
	PI_WORKFLOW_RUNTIME_MANIFEST,
} from "#workflows/registry/workflow-runtime-manifest";
import { WORKFLOW_SKILL_HELP } from "#workflows/skills/workflow-help-registry";

export {
	clearWorkflowPhase,
	initialWorkflowPhase,
	isKnownWorkflowPhase,
	isValidWorkflowTransition,
} from "#workflows/registry/workflow-runtime-manifest";

export const PI_WORKFLOW_SKILLS = Object.keys(PI_WORKFLOW_RUNTIME_MANIFEST) as WorkflowSkill[];

function buildManifest(skill: WorkflowSkill): WorkflowManifest {
	const runtime = getWorkflowRuntimeManifest(skill);
	const help = WORKFLOW_SKILL_HELP[skill];
	const verbs: WorkflowVerb[] = Object.keys(help.actions).map((name) => ({ name }));
	const typedArgs = help.typedArgs as readonly WorkflowTypedArg[];
	return { ...runtime, verbs, typedArgs } satisfies WorkflowManifest;
}

export const PI_WORKFLOW_MANIFEST: Record<WorkflowSkill, WorkflowManifest> = {
	"deep-interview": buildManifest("deep-interview"),
	ralplan: buildManifest("ralplan"),
	team: buildManifest("team"),
	ultragoal: buildManifest("ultragoal"),
};

export function getWorkflowManifest(skill: WorkflowSkill): WorkflowManifest {
	return PI_WORKFLOW_MANIFEST[skill];
}

export function typedArgsForWorkflowVerb(skill: WorkflowSkill, verb: string): WorkflowTypedArg[] {
	return WORKFLOW_SKILL_HELP[skill].typedArgs.filter(
		(arg) => arg.appliesToVerbs === undefined || arg.appliesToVerbs.includes(verb),
	);
}
