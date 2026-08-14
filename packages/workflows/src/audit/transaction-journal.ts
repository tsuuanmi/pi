import { type FileHandle, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sessionTransactionPath } from "@tsuuanmi/pi/session/layout";
import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";

/**
 * Per-mutation transaction journal for crash-recoverable workflow handoffs.
 *
 * One JSON file per handoff mutation at `.pi/{session}/state/transactions/<id>.json`.
 * The journal is written before mode-state mutation, updated as each step
 * completes, and removed after the handoff is fully applied. A crash leaves a
 * pending journal with partial steps for recovery tooling.
 *
 * Shape follows the approved spec D3 (object `steps` with per-step
 * `status`+`at`, `status:"complete"`, object `caller`/`callee`) with the
 * workflow-owned journal fields required for crash recovery.
 */

const JOURNAL_VERSION = 2 as const;

export interface WorkflowTransactionSide {
	skill: WorkflowSkill;
	phase: string;
}

export interface WorkflowTransactionStep {
	step: string;
	status: "done" | "pending";
	at?: string;
}

export interface WorkflowTransactionJournal {
	version: typeof JOURNAL_VERSION;
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
	sessionId: string;
	mutationId: string;
	caller: WorkflowTransactionSide;
	callee: WorkflowTransactionSide;
	paths: string[];
	stepNames: readonly string[];
}): Promise<string> {
	if (typeof input.sessionId !== "string" || input.sessionId.trim().length === 0) {
		throw new Error("workflow transaction journal requires a session id");
	}
	const sessionId = input.sessionId.trim();
	const filePath = sessionTransactionPath(input.cwd, sessionId, input.mutationId);
	const now = nowIso();
	const journal: WorkflowTransactionJournal = {
		version: JOURNAL_VERSION,
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
		if (err.code === "EEXIST") {
			await readJournal(input.cwd, sessionId, input.mutationId);
			return filePath;
		}
		throw error;
	} finally {
		await handle?.close();
	}
	return filePath;
}

async function readJournal(cwd: string, sessionId: string, mutationId: string): Promise<WorkflowTransactionJournal> {
	const filePath = sessionTransactionPath(cwd, sessionId, mutationId);
	const raw = await readFile(filePath, "utf8");
	const journal = JSON.parse(raw) as Partial<WorkflowTransactionJournal>;
	if (journal.version !== JOURNAL_VERSION) {
		throw new Error(`unsupported workflow transaction journal version: ${String(journal.version)}`);
	}
	if (journal.session_id !== sessionId) {
		throw new Error(`workflow transaction journal session mismatch: expected ${sessionId}`);
	}
	return journal as WorkflowTransactionJournal;
}

/** Mark a named step `done` with a timestamp; bump `updated_at`. */
export async function updateWorkflowTransactionJournal(
	cwd: string,
	sessionId: string,
	mutationId: string,
	stepName: string,
): Promise<string> {
	const filePath = sessionTransactionPath(cwd, sessionId, mutationId);
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
	const filePath = sessionTransactionPath(cwd, sessionId, mutationId);
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
