import { createSessionCheckpointStore } from "#workflows/skills/team/checkpoint-store";
import type { TeamWorkflowEvent } from "#workflows/skills/team/event-mapper";
import { saveTeamWorkflowEvents } from "#workflows/skills/team/event-store";
import { applyTeamExecution } from "#workflows/skills/team/execution-applier";
import { applyExecutionFailure } from "#workflows/skills/team/execution-failure";
import { saveTeamExecution } from "#workflows/skills/team/execution-store";
import {
	runTeamOrchestrator,
	type TeamOrchestratorInput,
	type TeamOrchestratorOutput,
} from "#workflows/skills/team/orchestrator";
import { mapTaskReceipt, type TeamTaskReceiptRef } from "#workflows/skills/team/receipt-mapper";
import { saveTeamReceipts } from "#workflows/skills/team/receipt-store";
import { saveRoleFailure } from "#workflows/skills/team/role-run-store";
import type { TeamSnapshot, TeamTask } from "#workflows/skills/team/types";
import { nowIso } from "#workflows/state/state-writer";

export interface TeamExecutionInput
	extends Omit<TeamOrchestratorInput, "name" | "tasks" | "checkpointStore" | "onEvent"> {
	cwd: string;
	sessionId: string;
	runId: string;
	role: string;
	snapshot: TeamSnapshot;
	tasks: readonly TeamTask[];
	persistIds: readonly string[];
	onEvent?: (event: TeamWorkflowEvent) => void;
}

export async function executeTeam(input: TeamExecutionInput): Promise<TeamSnapshot> {
	const checkpointStore = await prepareFreshRun(input);
	assertFreshTasks(input.tasks);
	return runExecution(input, checkpointStore);
}

export async function resumeTeam(input: TeamExecutionInput): Promise<TeamSnapshot> {
	const checkpointStore = await prepareResumeRun(input);
	return runExecution(input, checkpointStore);
}

export async function failTeamExecution(
	input: TeamExecutionInput,
	snapshot: TeamSnapshot,
	message: string,
): Promise<TeamSnapshot> {
	if (message.trim().length === 0) throw new Error("team execution failure requires a message");
	const failed = applyExecutionFailure(snapshot, input.persistIds, message, nowIso());
	await saveRoleFailure(
		input.cwd,
		requiredTeamId(snapshot.team_id),
		input.sessionId,
		input.runId,
		input.role,
		message,
	);
	await saveTeamExecution(input.cwd, input.sessionId, failed);
	return failed;
}

async function prepareFreshRun(input: TeamExecutionInput) {
	assertInput(input);
	const checkpointStore = createCheckpointStore(input);
	if (await checkpointStore.load()) throw new Error("team fresh execution cannot reuse an existing checkpoint");
	return checkpointStore;
}

async function prepareResumeRun(input: TeamExecutionInput) {
	assertInput(input);
	const checkpointStore = createCheckpointStore(input);
	const checkpoint = await checkpointStore.load();
	if (!checkpoint) throw new Error("team resume requires an existing checkpoint");
	if (checkpoint.status === "completed") throw new Error("team resume cannot use a completed checkpoint");
	if (checkpoint.status === "aborted") throw new Error("team resume cannot use an aborted checkpoint");
	return checkpointStore;
}

async function runExecution(
	input: TeamExecutionInput,
	checkpointStore: ReturnType<typeof createSessionCheckpointStore>,
) {
	const { cwd, sessionId, runId, role, snapshot: initial, tasks, persistIds, onEvent, signal } = input;
	const teamId = requiredTeamId(initial.team_id);
	const events: TeamWorkflowEvent[] = [];
	let output: TeamOrchestratorOutput;
	try {
		output = await runTeamOrchestrator({
			name: teamId,
			agents: input.agents,
			tasks,
			routes: input.routes,
			checkpointStore,
			signal,
			onEvent: (event) => {
				events.push(event);
				onEvent?.(event);
			},
		});
	} catch (error) {
		const receipts = await checkpointReceipts(checkpointStore);
		await persistFailure(input, teamId, events, errorMessage(error), receipts);
		throw error;
	}

	const persisted = filterOutput(output, persistIds);
	try {
		const snapshot = output.result.success
			? applyTeamExecution(initial, persisted)
			: applyExecutionFailure(
					initial,
					persistIds,
					executionFailure(output).message,
					nowIso(),
					persisted.receiptRefs,
				);
		await saveTeamExecution(cwd, sessionId, snapshot);
		await saveTeamReceipts(cwd, teamId, sessionId, runId, role, persisted.receiptRefs);
		await saveTeamWorkflowEvents(cwd, teamId, sessionId, runId, events);
		if (!output.result.success) throw executionFailure(output);
		return snapshot;
	} catch (error) {
		const receipts = mergeReceipts(persisted.receiptRefs, await checkpointReceipts(checkpointStore));
		await persistFailure(input, teamId, events, errorMessage(error), receipts);
		throw error;
	}
}

async function persistFailure(
	input: TeamExecutionInput,
	teamId: string,
	events: readonly TeamWorkflowEvent[],
	message: string,
	receipts: readonly TeamTaskReceiptRef[] = [],
): Promise<void> {
	try {
		const failed = applyExecutionFailure(input.snapshot, input.persistIds, message, nowIso(), receipts);
		await saveRoleFailure(input.cwd, teamId, input.sessionId, input.runId, input.role, message);
		await saveTeamExecution(input.cwd, input.sessionId, failed);
		await saveTeamReceipts(input.cwd, teamId, input.sessionId, input.runId, input.role, receipts);
		await saveTeamWorkflowEvents(input.cwd, teamId, input.sessionId, input.runId, events);
	} catch (error) {
		throw new Error(`team execution failure persistence failed: ${errorMessage(error)}`, { cause: error });
	}
}

async function checkpointReceipts(
	checkpointStore: ReturnType<typeof createSessionCheckpointStore>,
): Promise<readonly TeamTaskReceiptRef[]> {
	const checkpoint = await checkpointStore.load();
	if (!checkpoint) return [];
	return Object.values(checkpoint.receipts).map(mapTaskReceipt);
}

function mergeReceipts(
	first: readonly TeamTaskReceiptRef[],
	second: readonly TeamTaskReceiptRef[],
): readonly TeamTaskReceiptRef[] {
	return [...new Map([...first, ...second].map((receipt) => [receipt.id, receipt])).values()];
}

function filterOutput(output: TeamOrchestratorOutput, persistIds: readonly string[]): TeamOrchestratorOutput {
	return {
		...output,
		taskUpdates: output.taskUpdates.filter((update) => persistIds.includes(update.id)),
	};
}

function executionFailure(output: TeamOrchestratorOutput): Error {
	const errors = output.taskUpdates
		.map((update) => update.execution?.error)
		.filter((message): message is string => Boolean(message));
	const reason = errors[0] ?? output.result.abortedReason ?? "orchestrator reported unsuccessful execution";
	return new Error(`team execution failed: ${reason}`);
}

function assertInput(input: TeamExecutionInput): void {
	assertRunId(input.runId);
	requiredRole(input.role);
	if (!input.snapshot.team_id) throw new Error("team execution requires a team id");
	const proverMayRun = input.role === "prover" && input.snapshot.phase === "awaiting_integration";
	if (input.snapshot.phase !== "running" && !proverMayRun) {
		throw new Error(`team ${input.role} execution requires an executable team phase: ${input.snapshot.phase}`);
	}
	if (input.tasks.length === 0) throw new Error("team execution requires at least one task");
	for (const id of input.persistIds) {
		if (!input.snapshot.tasks.some((task) => task.id === id)) throw new Error(`unknown persisted team task: ${id}`);
	}
}

function assertFreshTasks(tasks: readonly TeamTask[]): void {
	for (const task of tasks) {
		if (task.status !== "pending") {
			throw new Error(`team execution requires fresh pending tasks: ${task.id} is ${task.status}`);
		}
		if (
			task.execution &&
			task.execution.status !== "failed" &&
			task.execution.status !== "blocked" &&
			task.execution.status !== "skipped"
		) {
			throw new Error(`team task already has successful execution state: ${task.id}`);
		}
	}
}

function createCheckpointStore(input: TeamExecutionInput) {
	return createSessionCheckpointStore(input.cwd, requiredTeamId(input.snapshot.team_id), input.sessionId, input.runId);
}

function requiredRole(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
		throw new Error("team execution requires a valid role");
	}
	return value;
}

function requiredTeamId(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
		throw new Error("team execution requires a valid team id");
	}
	return value;
}

function assertRunId(value: unknown): asserts value is string {
	if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
		throw new Error(`invalid team run id: ${String(value)}`);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
