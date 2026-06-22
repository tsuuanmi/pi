import { type WorkflowSkill, workflowStatePath } from "./paths.ts";
import { coerceWorkflowState, type WorkflowStateEnvelope } from "./state-schema.ts";
import {
	createWorkflowReceipt,
	nowIso,
	readExistingStateForMutation,
	type StrictMutationReadResult,
	stampWorkflowEnvelopeChecksum,
	writeJsonAtomic,
} from "./state-writer.ts";
import {
	clearWorkflowPhase,
	initialWorkflowPhase,
	isKnownWorkflowPhase,
	isValidWorkflowTransition,
	type WorkflowStateOperation,
} from "./workflow-manifest.ts";

export { defaultWorkflowId } from "./workflow-id.ts";

export interface WorkflowStateWriteOptions {
	operation?: WorkflowStateOperation;
	force?: boolean;
}

interface PriorPhaseInfo {
	classification: "absent" | "missing" | "known" | "unknown";
	phase?: string;
}

export async function readWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
): Promise<Record<string, unknown> | undefined> {
	const result = await readExistingStateForMutation(workflowStatePath(cwd, skill));
	if (result.kind === "absent") return undefined;
	if (result.kind === "corrupt") throw new Error(`workflow state is corrupt: ${result.error}`);
	return result.value;
}

function priorPhaseInfo(skill: WorkflowSkill, prior: StrictMutationReadResult): PriorPhaseInfo {
	if (prior.kind === "absent") return { classification: "absent" };
	if (prior.kind === "corrupt") return { classification: "unknown" };
	const phase = typeof prior.value.current_phase === "string" ? prior.value.current_phase.trim() : "";
	if (!phase) return { classification: "missing" };
	return isKnownWorkflowPhase(skill, phase)
		? { classification: "known", phase }
		: { classification: "unknown", phase };
}

function hasExplicitPhase(patch: Record<string, unknown>): boolean {
	return typeof patch.current_phase === "string" && patch.current_phase.trim().length > 0;
}

function phaseForValidation(
	skill: WorkflowSkill,
	prior: PriorPhaseInfo,
	patch: Record<string, unknown>,
	next: WorkflowStateEnvelope,
): string {
	if (hasExplicitPhase(patch)) return next.current_phase;
	if (prior.classification === "absent" || prior.classification === "missing") return initialWorkflowPhase(skill);
	return next.current_phase;
}

function workflowStateValidationError(input: {
	reason: string;
	skill: WorkflowSkill;
	prior: PriorPhaseInfo;
	nextPhase: string;
	operation: WorkflowStateOperation;
	command: string;
	forceAvailable: boolean;
}): Error {
	const prior = input.prior.phase ? `${input.prior.classification}:${input.prior.phase}` : input.prior.classification;
	return new Error(
		`invalid workflow state transition: ${input.reason}; skill=${input.skill}; prior=${prior}; next=${input.nextPhase}; operation=${input.operation}; command=${input.command}; force_available=${input.forceAvailable}`,
	);
}

function validateWorkflowStateWrite(input: {
	skill: WorkflowSkill;
	prior: StrictMutationReadResult;
	patch: Record<string, unknown>;
	next: WorkflowStateEnvelope;
	operation: WorkflowStateOperation;
	command: string;
	force: boolean;
}): void {
	const rawSkill = input.patch.skill;
	if (typeof rawSkill === "string" && rawSkill !== input.skill) {
		throw new Error(`workflow state skill mismatch: requested=${input.skill}; patch=${rawSkill}`);
	}
	if (input.next.skill !== input.skill) {
		throw new Error(`workflow state skill mismatch: requested=${input.skill}; next=${input.next.skill}`);
	}
	if (input.force) return;

	const prior = priorPhaseInfo(input.skill, input.prior);
	const nextPhase = phaseForValidation(input.skill, prior, input.patch, input.next).trim();
	const forceAvailable = true;
	if (prior.classification === "unknown" && !hasExplicitPhase(input.patch) && input.operation !== "clear") {
		throw workflowStateValidationError({
			reason: "unknown prior phase requires explicit known repair phase",
			skill: input.skill,
			prior,
			nextPhase,
			operation: input.operation,
			command: input.command,
			forceAvailable,
		});
	}
	if (!isKnownWorkflowPhase(input.skill, nextPhase)) {
		throw workflowStateValidationError({
			reason: "unknown next phase",
			skill: input.skill,
			prior,
			nextPhase,
			operation: input.operation,
			command: input.command,
			forceAvailable,
		});
	}
	if (prior.classification !== "known") return;
	const priorPhase = prior.phase;
	if (!priorPhase) return;
	if (priorPhase === nextPhase) {
		if (!isKnownWorkflowPhase(input.skill, priorPhase)) {
			throw workflowStateValidationError({
				reason: "unknown same phase is not preserved",
				skill: input.skill,
				prior,
				nextPhase,
				operation: input.operation,
				command: input.command,
				forceAvailable,
			});
		}
		return;
	}
	if (
		!isValidWorkflowTransition(input.skill, priorPhase, nextPhase, {
			operation: input.operation,
			command: input.command,
			force: input.force,
		})
	) {
		throw workflowStateValidationError({
			reason: "transition is not allowed by workflow manifest",
			skill: input.skill,
			prior,
			nextPhase,
			operation: input.operation,
			command: input.command,
			forceAvailable,
		});
	}
}

async function persistWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	prior: StrictMutationReadResult,
	existingForMerge: Record<string, unknown>,
	patch: Record<string, unknown>,
	command: string,
	options: WorkflowStateWriteOptions,
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const mutatedAt = nowIso();
	const next = coerceWorkflowState(skill, existingForMerge, patch, mutatedAt);
	validateWorkflowStateWrite({
		skill,
		prior,
		patch,
		next,
		operation: options.operation ?? "write",
		command,
		force: options.force ?? false,
	});
	next.receipt = createWorkflowReceipt({
		skill,
		statePath: path,
		command,
		mutatedAt,
		forced: options.force,
		operation: options.operation,
	});
	const stamped = stampWorkflowEnvelopeChecksum(next, path, mutatedAt);
	await writeJsonAtomic(path, stamped, { cwd });
	return stamped;
}

export async function writeWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown>,
	command = "pi workflow state write",
	options: WorkflowStateWriteOptions = {},
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const existingRead = await readExistingStateForMutation(path);
	if (existingRead.kind === "corrupt") {
		throw new Error(`workflow state is corrupt: ${existingRead.error}`);
	}
	const prior = existingRead;
	const priorInfo = priorPhaseInfo(skill, prior);
	const existing = existingRead.kind === "valid" ? existingRead.value : {};
	let patchForWrite = patch;
	if (!hasExplicitPhase(patch) && (priorInfo.classification === "absent" || priorInfo.classification === "missing")) {
		patchForWrite = { ...patch, current_phase: initialWorkflowPhase(skill) };
	}
	return persistWorkflowState(cwd, skill, prior, existing, patchForWrite, command, {
		operation: options.operation ?? "write",
		force: options.force,
	});
}

export async function replaceWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	state: Record<string, unknown>,
	command = "pi workflow state replace",
	options: WorkflowStateWriteOptions = {},
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const existingRead = await readExistingStateForMutation(path);
	if (existingRead.kind === "corrupt") {
		throw new Error(`workflow state is corrupt: ${existingRead.error}`);
	}
	const patch = hasExplicitPhase(state) ? state : { ...state, current_phase: initialWorkflowPhase(skill) };
	return persistWorkflowState(cwd, skill, existingRead, {}, patch, command, {
		operation: options.operation ?? "replace",
		force: options.force,
	});
}

export async function clearWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown> = {},
	options: WorkflowStateWriteOptions = {},
): Promise<WorkflowStateEnvelope> {
	const clearPatch = { ...patch, active: false, current_phase: clearWorkflowPhase(skill) };
	return writeWorkflowState(cwd, skill, clearPatch, "pi workflow state clear", {
		operation: options.operation ?? "clear",
		force: options.force,
	});
}

export async function activeRalplanRunId(cwd: string): Promise<string | undefined> {
	const state = await readWorkflowState(cwd, "ralplan");
	const candidate = typeof state?.run_id === "string" ? state.run_id.trim() : "";
	return candidate || undefined;
}
