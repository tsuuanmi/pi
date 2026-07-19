import { type FileHandle, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowSkill } from "#workflows/session/paths";
import { transactionJournalPath } from "#workflows/session/paths";

/**
 * Per-mutation transaction journal for crash-recoverable workflow handoffs.
 *
 * One JSON file per handoff mutation at `.pi/{session}/state/transactions/<id>.json`
 * (mirrors Gajae's `.gjc/state/transactions/<id>.json`). The journal is
 * written **before** any mode-state mutation (`status:"pending"`), updated as
 * each step completes, and removed once the handoff is fully applied
 * (`status:"complete"` then unlink). A crash mid-handoff leaves a `pending`
 * journal with partial `steps` — durable evidence for the deferred STATE-007
 * doctor to detect and repair orphans.
 *
 * Shape follows the approved spec D3 (object `steps` with per-step
 * `status`+`at`, `status:"complete"`, object `caller`/`callee`) augmented with
 * Gajae's forward-compat fields (`version`, `mutation_id`, `created_at`,
 * `updated_at`) so the future doctor can correlate journals with audit
 * `mutation_id`s and assess staleness without a migration.
 */

export interface WorkflowTransactionSide {
	skill: WorkflowSkill;
	sessionId?: string;
	phase: string;
}

export interface WorkflowTransactionStep {
	step: string;
	status: "done" | "pending";
	at?: string;
}

export interface WorkflowTransactionJournal {
	version: 1;
	mutation_id: string;
	status: "pending" | "complete";
	created_at: string;
	updated_at: string;
	caller: WorkflowTransactionSide;
	callee: WorkflowTransactionSide;
	paths: string[];
	steps: WorkflowTransactionStep[];
	/** Session id for session-scoped journal entries. */
	session_id: string;
}

function nowIso(): string {
	return new Date().toISOString();
}

function jsonText(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

/** Create the journal file with `status:"pending"` and all steps `pending`. */
export async function beginWorkflowTransactionJournal(input: {
	cwd: string;
	mutationId: string;
	caller: WorkflowTransactionSide;
	callee: WorkflowTransactionSide;
	paths: string[];
	stepNames: readonly string[];
}): Promise<string> {
	const sessionId = input.caller.sessionId?.trim() || input.callee.sessionId?.trim();
	if (!sessionId) throw new Error("workflow transaction journal requires a session id");
	const filePath = transactionJournalPath(input.cwd, sessionId, input.mutationId);
	const now = nowIso();
	const journal: WorkflowTransactionJournal = {
		version: 1,
		mutation_id: input.mutationId,
		status: "pending",
		created_at: now,
		updated_at: now,
		caller: input.caller,
		callee: input.callee,
		paths: input.paths,
		steps: input.stepNames.map((step) => ({ step, status: "pending" })),
		session_id: sessionId,
	};
	await mkdir(dirname(filePath), { recursive: true });
	// O_EXCL create: a collision means a same-mutationId journal already exists.
	let handle: FileHandle | undefined;
	try {
		handle = await open(filePath, "wx");
		await handle.writeFile(jsonText(journal));
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "EEXIST") return filePath;
		throw error;
	} finally {
		await handle?.close();
	}
	return filePath;
}

async function readJournal(cwd: string, sessionId: string, mutationId: string): Promise<WorkflowTransactionJournal> {
	const filePath = transactionJournalPath(cwd, sessionId, mutationId);
	const raw = await readFile(filePath, "utf8");
	return JSON.parse(raw) as WorkflowTransactionJournal;
}

/** Mark a named step `done` with a timestamp; bump `updated_at`. */
export async function updateWorkflowTransactionJournal(
	cwd: string,
	sessionId: string,
	mutationId: string,
	stepName: string,
): Promise<string> {
	const filePath = transactionJournalPath(cwd, sessionId, mutationId);
	const current = await readJournal(cwd, sessionId, mutationId);
	const now = nowIso();
	const steps = current.steps.map((entry) =>
		entry.step === stepName ? { step: entry.step, status: "done" as const, at: now } : entry,
	);
	const next: WorkflowTransactionJournal = { ...current, steps, updated_at: now };
	await writeFile(filePath, jsonText(next));
	return filePath;
}

/**
 * Set `status:"complete"`, persist it, then remove the journal file. The
 * intermediate `complete` write records the terminal status durably before
 * unlink, so a crash between the two still leaves a `complete` journal (not a
 * misleading `pending` orphan). ENOENT on unlink is swallowed (already gone).
 */
export async function completeWorkflowTransactionJournal(
	cwd: string,
	sessionId: string,
	mutationId: string,
): Promise<void> {
	const filePath = transactionJournalPath(cwd, sessionId, mutationId);
	const current = await readJournal(cwd, sessionId, mutationId);
	const now = nowIso();
	const next: WorkflowTransactionJournal = { ...current, status: "complete", updated_at: now };
	await writeFile(filePath, jsonText(next));
	try {
		await unlink(filePath);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code !== "ENOENT") throw error;
	}
}
