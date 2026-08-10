import type { ExpectedNextRole } from "#workflows/policy/expected-next-role";
import type { RuntimeReceipt } from "#workflows/runtime/types";
import type { WorkflowSkill } from "#workflows/session/paths";
import { deepInterviewPolicy } from "#workflows/skills/deep-interview/policy";
import { ralplanPolicy } from "#workflows/skills/ralplan/policy";
import { teamPolicy } from "#workflows/skills/team/policy";
import { ultragoalPolicy } from "#workflows/skills/ultragoal/policy";

export type TerminalDetectorKind = "receipt" | "filesystem" | "state";

export type MaybeAsync<T> = T | Promise<T>;

export interface SkillPolicyContext<State = unknown> {
	skill: WorkflowSkill;
	state: State | undefined;
	runId?: string;
	teamId?: string;
	sessionId?: string;
	cwd?: string;
	input?: Record<string, unknown>;
	receipts?: readonly RuntimeReceipt[];
}

export interface TerminalDetector<State = unknown> {
	id: string;
	kind: TerminalDetectorKind;
	description: string;
	isTerminal?(context: SkillPolicyContext<State>): boolean;
}

export interface GateValidator<State = unknown> {
	id: string;
	description: string;
	validate?(context: SkillPolicyContext<State>): MaybeAsync<{ ok: boolean; blockers: string[] }>;
}

export interface SkillPolicy<State = unknown> {
	skill: WorkflowSkill;
	interactive?: boolean;
	blockingQuestionPhases?: readonly string[];
	terminalDetectors?: readonly TerminalDetector<State>[];
	gateValidators?: readonly GateValidator<State>[];
	selectNextRole(context: SkillPolicyContext<State>): ExpectedNextRole | undefined;
	isQuestionBlocked?(state: State | undefined): boolean;
}

const policies = {
	"deep-interview": deepInterviewPolicy,
	ralplan: ralplanPolicy,
	team: teamPolicy,
	ultragoal: ultragoalPolicy,
} as const;

function normalizePhase(phase: string | undefined): string | undefined {
	return phase?.trim().toLowerCase() || undefined;
}

export function getSkillPolicy<State = unknown>(skill: WorkflowSkill): SkillPolicy<State> {
	return policies[skill] as SkillPolicy<State>;
}

export function nextRoleForSkill<State>(context: SkillPolicyContext<State>): ExpectedNextRole | undefined {
	return getSkillPolicy<State>(context.skill).selectNextRole(context);
}

export function hasPendingQuestion<State>(skill: WorkflowSkill, state: State | undefined): boolean {
	return getSkillPolicy<State>(skill).isQuestionBlocked?.(state) === true;
}

export function isBlockingQuestionPhase(skill: WorkflowSkill, phase: string | undefined): boolean {
	const policy = getSkillPolicy(skill);
	if (!policy.interactive) return false;
	const normalized = normalizePhase(phase);
	if (!normalized) return false;
	return (policy.blockingQuestionPhases ?? []).some((item) => normalizePhase(item) === normalized);
}

export function getTerminalDetectors(skill: WorkflowSkill): readonly TerminalDetector[] {
	return getSkillPolicy(skill).terminalDetectors ?? [];
}

export function getGateValidators(skill: WorkflowSkill): readonly GateValidator[] {
	return getSkillPolicy(skill).gateValidators ?? [];
}

function receiptMatchesDetector(receipt: RuntimeReceipt, detectorId: string): boolean {
	const evidence = receipt.evidence as Record<string, unknown>;
	return (
		receipt.accepted === true &&
		(evidence.terminalDetectorId === detectorId ||
			evidence.detectorId === detectorId ||
			(Array.isArray(evidence.terminalDetectorIds) && evidence.terminalDetectorIds.includes(detectorId)))
	);
}

export function evaluateTerminalDetectors<State>(context: SkillPolicyContext<State>): {
	ok: boolean;
	matched: string[];
	blockers: string[];
} {
	const detectors = getTerminalDetectors(context.skill);
	if (detectors.length === 0) return { ok: true, matched: [], blockers: [] };
	const matched = detectors
		.filter((detector) => {
			if (detector.isTerminal?.(context)) return true;
			return (context.receipts ?? []).some((receipt) => receiptMatchesDetector(receipt, detector.id));
		})
		.map((detector) => detector.id);
	if (matched.length > 0) return { ok: true, matched, blockers: [] };
	return {
		ok: false,
		matched,
		blockers: [`terminal-detector-missing:${detectors.map((detector) => detector.id).join("|")}`],
	};
}

export async function evaluateGates<State>(context: SkillPolicyContext<State>): Promise<{
	ok: boolean;
	blockers: string[];
}> {
	const blockers: string[] = [];
	for (const validator of getGateValidators(context.skill)) {
		const result = await validator.validate?.(context);
		if (result && !result.ok) blockers.push(...result.blockers.map((blocker) => `${validator.id}:${blocker}`));
	}
	return { ok: blockers.length === 0, blockers };
}
