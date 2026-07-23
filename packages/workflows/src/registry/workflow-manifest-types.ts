import type { WorkflowSkill } from "#workflows/session/paths";

export type WorkflowStateOperation =
	| "initialize"
	| "write"
	| "replace"
	| "clear"
	| "handoff-send"
	| "handoff-receive"
	| "runtime-sync"
	| "force-repair";

export interface WorkflowTransition {
	from: string | "*";
	to: string;
	operations: readonly WorkflowStateOperation[];
	verb?: string;
	compatibility?: boolean;
	reason?: string;
}

export interface WorkflowVerb {
	name: string;
}

export interface WorkflowTypedArg {
	name: string;
	type: "string" | "number" | "boolean" | "enum" | "object";
	enumValues?: readonly string[];
	required?: boolean;
	appliesToVerbs?: readonly string[];
}

export interface WorkflowRetentionPolicy {
	category: string;
	keep?: number;
	maxAgeDays?: number;
}

export interface WorkflowManifest {
	skill: WorkflowSkill;
	states: readonly string[];
	initialState: string;
	terminalStates: readonly string[];
	clearState: string;
	transitions: readonly WorkflowTransition[];
	verbs: readonly WorkflowVerb[];
	typedArgs: readonly WorkflowTypedArg[];
	retention: readonly WorkflowRetentionPolicy[];
	hudFields: readonly string[];
	graphLabel: string;
}

export type WorkflowRuntimeManifest = Omit<WorkflowManifest, "verbs" | "typedArgs">;

export interface WorkflowStateValidationContext {
	operation: WorkflowStateOperation;
	command: string;
	force: boolean;
}
