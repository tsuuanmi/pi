import type { WorkflowSkill } from "./paths.ts";
import { expectedNextRoleForSkill } from "./skill-registry.ts";

export interface ExpectedNextRole {
	skill: WorkflowSkill;
	stage: string;
	role: string;
	owner: string;
	runId?: string;
	teamId?: string;
	taskId?: string;
	gate?: string;
	attempt?: number;
}

export function describeExpectedNextRole(expected: ExpectedNextRole): string {
	const scope = [
		`skill=${expected.skill}`,
		`stage=${expected.stage}`,
		`role=${expected.role}`,
		`owner=${expected.owner}`,
		expected.runId ? `run=${expected.runId}` : undefined,
		expected.teamId ? `team=${expected.teamId}` : undefined,
		expected.taskId ? `task=${expected.taskId}` : undefined,
		expected.gate ? `gate=${expected.gate}` : undefined,
		expected.attempt !== undefined ? `attempt=${expected.attempt}` : undefined,
	].filter(Boolean);
	return scope.join("; ");
}

export function assertExpectedNextRole(
	expected: ExpectedNextRole,
	actual: {
		skill: string;
		stage: string;
		role: string;
		owner?: string;
		runId?: string;
		teamId?: string;
		taskId?: string;
	},
): void {
	const mismatches: string[] = [];
	if (actual.skill !== expected.skill) mismatches.push(`skill ${actual.skill} != ${expected.skill}`);
	if (actual.stage !== expected.stage) mismatches.push(`stage ${actual.stage} != ${expected.stage}`);
	if (actual.role !== expected.role) mismatches.push(`role ${actual.role} != ${expected.role}`);
	if (actual.owner !== undefined && actual.owner !== expected.owner)
		mismatches.push(`owner ${actual.owner} != ${expected.owner}`);
	if (expected.runId !== undefined && actual.runId !== undefined && actual.runId !== expected.runId)
		mismatches.push(`run ${actual.runId} != ${expected.runId}`);
	if (expected.teamId !== undefined && actual.teamId !== expected.teamId)
		mismatches.push(`team ${actual.teamId} != ${expected.teamId}`);
	if (expected.taskId !== undefined && actual.taskId !== expected.taskId)
		mismatches.push(`task ${actual.taskId} != ${expected.taskId}`);
	if (mismatches.length > 0) {
		throw new Error(
			`off-script spawn refused: ${mismatches.join(", ")}; expected ${describeExpectedNextRole(expected)}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Deterministic table-driven selectors
//
// These exported functions are compatibility facades for existing tests and
// runtime helpers. The phase logic itself is registered by per-skill transition
// sidecars (for example, harness/ralplan/ralplan-transitions.ts). This keeps the
// guarded spawn contract in one shared module while avoiding a second, hardcoded
// transition engine here.
// ---------------------------------------------------------------------------

/** Ralplan verdict slice accepted by the selector (architect or critic). */
export interface RalplanSelectorVerdict {
	role: "architect" | "critic";
	/** architect clarity. */
	clarity?: "clear" | "watch" | "block";
	/** architect recommendation. */
	recommendation?: "approve" | "comment" | "request_changes";
	/** critic verdict. */
	verdict?: "approve" | "iterate" | "reject";
}

/** Latest ralplan index row slice used by the selector. */
export interface RalplanSelectorLatest {
	stage: string;
	verdict?: RalplanSelectorVerdict;
}

/** Ralplan state slice accepted by the selector. */
export interface RalplanSelectorState {
	current_phase?: string;
	latest?: RalplanSelectorLatest;
	/** Pre-planner explorer gate status slice ("passed" | "retry_requested" | "human_blocked" | "missing"). */
	explorerGate?: { status: string };
	iterateCount?: number;
	iterateCap?: number;
	expertEscalation?: boolean;
	expertCount?: number;
	expertCap?: number;
}

export function expectedNextRalplanRole(
	state: RalplanSelectorState | undefined,
	runId: string,
): ExpectedNextRole | undefined {
	return expectedNextRoleForSkill({ skill: "ralplan", state, runId });
}

/** Team task slice accepted by the selector. */
export interface TeamSelectorTask {
	id: string;
	status: string;
}

/** Team snapshot slice accepted by the selector. */
export interface TeamSelectorSnapshot {
	team_id?: string;
	tasks: TeamSelectorTask[];
}

export function expectedNextTeamRole(snapshot: TeamSelectorSnapshot | undefined): ExpectedNextRole | undefined {
	return expectedNextRoleForSkill({ skill: "team", state: snapshot });
}

export function assertNoGuardedSpawnOverrides(input: {
	agent?: string;
	model?: string;
	thinkingLevel?: string;
	tools?: readonly string[];
	excludeTools?: readonly string[];
}): void {
	const overrides = [
		input.agent ? "agent" : undefined,
		input.model ? "model" : undefined,
		input.thinkingLevel ? "thinkingLevel" : undefined,
		input.tools ? "tools" : undefined,
		input.excludeTools ? "excludeTools" : undefined,
	].filter(Boolean);
	if (overrides.length > 0) {
		throw new Error(`guarded workflow spawns do not accept runtime overrides: ${overrides.join(", ")}`);
	}
}
