import { randomBytes, randomUUID } from "node:crypto";
import { appendAuditEntry, auditStateWrite, auditVerbForOperation } from "#workflows/audit/audit-log";
import { assertStateIntegrity } from "#workflows/audit/tamper-detection";
import {
	clearWorkflowPhase,
	initialWorkflowPhase,
	isKnownWorkflowPhase,
	isValidWorkflowTransition,
	type WorkflowStateOperation,
} from "#workflows/registry/workflow-manifest";
import type { WorkflowSkill } from "#workflows/session/paths";
import { workflowStatePath } from "#workflows/session/session-layout";
import { coerceWorkflowState, type WorkflowStateEnvelope } from "#workflows/state/state-schema";
import {
	createWorkflowReceipt,
	nowIso,
	readExistingStateForMutation,
	type StrictMutationReadResult,
	stampWorkflowEnvelopeChecksum,
	writeJsonAtomic,
} from "#workflows/state/state-writer";

export function defaultWorkflowId(prefix: string): string {
	const date = new Date();
	const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
	const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const dd = date.getUTCDate().toString().padStart(2, "0");
	const hh = date.getUTCHours().toString().padStart(2, "0");
	const min = date.getUTCMinutes().toString().padStart(2, "0");
	return `${prefix}-${yyyy}-${mm}-${dd}-${hh}${min}-${randomBytes(2).toString("hex")}`;
}

export interface WorkflowStateWriteOptions {
	operation?: WorkflowStateOperation;
	/** Shared mutation id for both-side receipts + audit + transaction journal. Internal-only. */
	mutationId?: string;
	/** Session id for session-scoped path resolution. */
	sessionId: string;
}

export interface WorkflowStateReadOptions {
	/** Session id for session-scoped path resolution. */
	sessionId: string;
}

interface PriorPhaseInfo {
	classification: "absent" | "missing" | "known" | "unknown";
	phase?: string;
}

export async function readWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	options: WorkflowStateReadOptions,
): Promise<Record<string, unknown> | undefined> {
	const result = await readExistingStateForMutation(workflowStatePath(cwd, skill, options.sessionId));
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
}): Error {
	const prior = input.prior.phase ? `${input.prior.classification}:${input.prior.phase}` : input.prior.classification;
	return new Error(
		`invalid workflow state transition: ${input.reason}; skill=${input.skill}; prior=${prior}; next=${input.nextPhase}; operation=${input.operation}; command=${input.command}`,
	);
}

async function validateWorkflowStateWrite(input: {
	skill: WorkflowSkill;
	prior: StrictMutationReadResult;
	patch: Record<string, unknown>;
	next: WorkflowStateEnvelope;
	operation: WorkflowStateOperation;
	command: string;
	cwd: string;
	path: string;
	mutationId: string;
	sessionId: string;
}): Promise<void> {
	const rawSkill = input.patch.skill;
	if (typeof rawSkill === "string" && rawSkill !== input.skill) {
		throw new Error(`workflow state skill mismatch: requested=${input.skill}; patch=${rawSkill}`);
	}
	if (input.next.skill !== input.skill) {
		throw new Error(`workflow state skill mismatch: requested=${input.skill}; next=${input.next.skill}`);
	}
	const prior = priorPhaseInfo(input.skill, input.prior);
	const nextPhase = phaseForValidation(input.skill, prior, input.patch, input.next).trim();
	if (prior.classification === "unknown" && !hasExplicitPhase(input.patch) && input.operation !== "clear") {
		throw workflowStateValidationError({
			reason: "unknown prior phase requires explicit known repair phase",
			skill: input.skill,
			prior,
			nextPhase,
			operation: input.operation,
			command: input.command,
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
			});
		}
		return;
	}
	if (
		!isValidWorkflowTransition(input.skill, priorPhase, nextPhase, {
			operation: input.operation,
			command: input.command,
		})
	) {
		// Record the rejected transition before returning the hard failure.
		await appendAuditEntry(input.cwd, input.sessionId, {
			ts: new Date().toISOString(),
			skill: input.skill,
			category: "state",
			verb: "invalid_transition_detected",
			owner: "pi-workflow",
			mutation_id: input.mutationId,
			from_phase: priorPhase,
			to_phase: nextPhase,
			paths: [input.path],
		});
		throw workflowStateValidationError({
			reason: "transition is not allowed by workflow manifest",
			skill: input.skill,
			prior,
			nextPhase,
			operation: input.operation,
			command: input.command,
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
	const sessionId = options.sessionId;
	const path = workflowStatePath(cwd, skill, sessionId);
	const mutatedAt = nowIso();
	const mutationId = options.mutationId ?? randomUUID();
	const next = coerceWorkflowState(skill, existingForMerge, patch, mutatedAt);
	await assertStateIntegrity(cwd, path, skill, {
		mutationId,
		sessionId,
	});
	// Validate every transition against the canonical manifest.
	await validateWorkflowStateWrite({
		skill,
		prior,
		patch,
		next,
		operation: options.operation ?? "write",
		command,
		cwd,
		path,
		mutationId,
		sessionId,
	});
	next.receipt = createWorkflowReceipt({
		skill,
		statePath: path,
		command,
		mutatedAt,
		operation: options.operation,
		mutationId,
	});
	const stamped = stampWorkflowEnvelopeChecksum(next, path, mutatedAt);
	await writeJsonAtomic(path, stamped, { cwd });
	const fromPhase =
		prior.kind === "valid" && typeof prior.value.current_phase === "string" ? prior.value.current_phase : undefined;
	const toPhase = next.current_phase;
	// Audit the sanctioned write.
	await auditStateWrite({
		cwd,
		skill,
		path,
		verb: auditVerbForOperation(options.operation),
		mutationId,
		fromPhase,
		toPhase,
		sessionId,
	});
	return stamped;
}

export async function writeWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown>,
	command = "pi workflow state write",
	options: WorkflowStateWriteOptions,
): Promise<WorkflowStateEnvelope> {
	const sessionId = options.sessionId;
	const path = workflowStatePath(cwd, skill, sessionId);
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
		mutationId: options.mutationId,
		sessionId,
	});
}

export async function replaceWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	state: Record<string, unknown>,
	command = "pi workflow state replace",
	options: WorkflowStateWriteOptions,
): Promise<WorkflowStateEnvelope> {
	const sessionId = options.sessionId;
	const path = workflowStatePath(cwd, skill, sessionId);
	const existingRead = await readExistingStateForMutation(path);
	if (existingRead.kind === "corrupt") {
		throw new Error(`workflow state is corrupt: ${existingRead.error}`);
	}
	const patch = hasExplicitPhase(state) ? state : { ...state, current_phase: initialWorkflowPhase(skill) };
	return persistWorkflowState(cwd, skill, existingRead, {}, patch, command, {
		operation: options.operation ?? "replace",
		mutationId: options.mutationId,
		sessionId,
	});
}

export async function clearWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown> = {},
	options: WorkflowStateWriteOptions,
): Promise<WorkflowStateEnvelope> {
	const clearPatch = { ...patch, active: false, current_phase: clearWorkflowPhase(skill) };
	return writeWorkflowState(cwd, skill, clearPatch, "pi workflow state clear", {
		operation: options.operation ?? "clear",
		sessionId: options.sessionId,
	});
}

export async function activeRalplanRunId(cwd: string, sessionId: string): Promise<string | undefined> {
	const state = await readWorkflowState(cwd, "ralplan", { sessionId });
	const candidate = typeof state?.run_id === "string" ? state.run_id.trim() : "";
	return candidate || undefined;
}
