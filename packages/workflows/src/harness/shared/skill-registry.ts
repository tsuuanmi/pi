import type { RuntimeReceipt } from "../runtime/types.ts";
import type { ExpectedNextRole } from "./expected-next-role.ts";
import type { WorkflowSkill } from "./paths.ts";

export type TerminalDetectorKind = "receipt" | "filesystem" | "state";

export type MaybeAsync<T> = T | Promise<T>;

export interface SkillTransitionContext<State = unknown> {
	skill: WorkflowSkill;
	state: State | undefined;
	runId?: string;
	teamId?: string;
	sessionId?: string;
	cwd?: string;
	input?: Record<string, unknown>;
	receipts?: readonly RuntimeReceipt[];
}

export interface SkillTerminalDetector<State = unknown> {
	id: string;
	kind: TerminalDetectorKind;
	description: string;
	isTerminal?(context: SkillTransitionContext<State>): boolean;
}

export interface SkillGateValidator<State = unknown> {
	id: string;
	description: string;
	validate?(context: SkillTransitionContext<State>): MaybeAsync<{ ok: boolean; blockers: string[] }>;
}

export interface SkillTransitionTable<State = unknown> {
	skill: WorkflowSkill;
	interactive?: boolean;
	blockingQuestionPhases?: readonly string[];
	terminalDetectors?: readonly SkillTerminalDetector<State>[];
	gateValidators?: readonly SkillGateValidator<State>[];
	selectNextRole(context: SkillTransitionContext<State>): ExpectedNextRole | undefined;
	isQuestionBlocked?(state: State | undefined): boolean;
}

const registry = new Map<WorkflowSkill, SkillTransitionTable>();

function normalizePhase(phase: string | undefined): string | undefined {
	return phase?.trim().toLowerCase() || undefined;
}

export function registerSkillTransitionTable<State>(table: SkillTransitionTable<State>): void {
	registry.set(table.skill, table as SkillTransitionTable);
}

export function getSkillTransitionTable(skill: WorkflowSkill): SkillTransitionTable {
	const table = registry.get(skill);
	if (!table) throw new Error(`no transition table registered for skill: ${skill}`);
	return table;
}

export function expectedNextRoleForSkill<State>(context: SkillTransitionContext<State>): ExpectedNextRole | undefined {
	return getSkillTransitionTable(context.skill).selectNextRole(context as SkillTransitionContext);
}

export function hasPendingQuestionForSkill<State>(skill: WorkflowSkill, state: State | undefined): boolean {
	return getSkillTransitionTable(skill).isQuestionBlocked?.(state as unknown) === true;
}

export function isBlockingQuestionPhaseForSkill(skill: WorkflowSkill, phase: string | undefined): boolean {
	const table = getSkillTransitionTable(skill);
	if (!table.interactive) return false;
	const normalized = normalizePhase(phase);
	if (!normalized) return false;
	return (table.blockingQuestionPhases ?? []).some((item) => normalizePhase(item) === normalized);
}

export function skillTerminalDetectors(skill: WorkflowSkill): readonly SkillTerminalDetector[] {
	return getSkillTransitionTable(skill).terminalDetectors ?? [];
}

export function skillGateValidators(skill: WorkflowSkill): readonly SkillGateValidator[] {
	return getSkillTransitionTable(skill).gateValidators ?? [];
}

function inputStringArray(input: Record<string, unknown> | undefined, key: string): string[] {
	const value = input?.[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

export function evaluateSkillTerminalDetectors<State>(context: SkillTransitionContext<State>): {
	ok: boolean;
	matched: string[];
	blockers: string[];
} {
	const detectors = skillTerminalDetectors(context.skill);
	if (detectors.length === 0) return { ok: true, matched: [], blockers: [] };
	const explicit = new Set(inputStringArray(context.input, "terminalDetectorIds"));
	const matched = detectors
		.filter((detector) => {
			if (detector.isTerminal?.(context)) return true;
			if (explicit.has(detector.id)) return true;
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

export async function evaluateSkillGateValidators<State>(context: SkillTransitionContext<State>): Promise<{
	ok: boolean;
	blockers: string[];
}> {
	const validators = skillGateValidators(context.skill);
	const blockers: string[] = [];
	for (const validator of validators) {
		try {
			const result = await validator.validate?.(context);
			if (!result) continue;
			if (!result.ok) blockers.push(...result.blockers.map((blocker) => `${validator.id}:${blocker}`));
		} catch (error) {
			blockers.push(`${validator.id}:gate-read-error:${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { ok: blockers.length === 0, blockers };
}

export function clearSkillTransitionTablesForTests(): void {
	registry.clear();
}
