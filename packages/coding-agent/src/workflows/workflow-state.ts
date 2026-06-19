import { type WorkflowSkill, workflowStatePath } from "./paths.ts";
import { coerceWorkflowState, type WorkflowStateEnvelope } from "./state-schema.ts";
import {
	createWorkflowReceipt,
	nowIso,
	readExistingStateForMutation,
	stampWorkflowEnvelopeChecksum,
	writeJsonAtomic,
} from "./state-writer.ts";

export { defaultWorkflowId } from "./workflow-id.ts";

export async function readWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
): Promise<Record<string, unknown> | undefined> {
	const result = await readExistingStateForMutation(workflowStatePath(cwd, skill));
	if (result.kind === "absent") return undefined;
	if (result.kind === "corrupt") throw new Error(`workflow state is corrupt: ${result.error}`);
	return result.value;
}

async function writeWorkflowStateWithExisting(
	cwd: string,
	skill: WorkflowSkill,
	existing: Record<string, unknown>,
	patch: Record<string, unknown>,
	command: string,
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const mutatedAt = nowIso();
	const next = coerceWorkflowState(skill, existing, patch, mutatedAt);
	next.receipt = createWorkflowReceipt({ skill, statePath: path, command, mutatedAt });
	const stamped = stampWorkflowEnvelopeChecksum(next, path, mutatedAt);
	await writeJsonAtomic(path, stamped, { cwd });
	return stamped;
}

export async function writeWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown>,
	command = "pi workflow state write",
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const existingRead = await readExistingStateForMutation(path);
	if (existingRead.kind === "corrupt") {
		throw new Error(`workflow state is corrupt: ${existingRead.error}`);
	}
	const existing = existingRead.kind === "valid" ? existingRead.value : {};
	return writeWorkflowStateWithExisting(cwd, skill, existing, patch, command);
}

export async function replaceWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	state: Record<string, unknown>,
	command = "pi workflow state replace",
): Promise<WorkflowStateEnvelope> {
	const path = workflowStatePath(cwd, skill);
	const existingRead = await readExistingStateForMutation(path);
	if (existingRead.kind === "corrupt") {
		throw new Error(`workflow state is corrupt: ${existingRead.error}`);
	}
	return writeWorkflowStateWithExisting(cwd, skill, {}, state, command);
}

export async function clearWorkflowState(
	cwd: string,
	skill: WorkflowSkill,
	patch: Record<string, unknown> = {},
): Promise<WorkflowStateEnvelope> {
	return writeWorkflowState(
		cwd,
		skill,
		{ active: false, current_phase: "complete", ...patch },
		"pi workflow state clear",
	);
}

export async function activeRalplanRunId(cwd: string): Promise<string | undefined> {
	const state = await readWorkflowState(cwd, "ralplan");
	const candidate = typeof state?.run_id === "string" ? state.run_id.trim() : "";
	return candidate || undefined;
}
