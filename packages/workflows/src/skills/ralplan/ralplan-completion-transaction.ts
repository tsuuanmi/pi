import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import { transactionJournalPath } from "#workflows/harness/shared/session/session-layout";
import { nowIso, writeJsonAtomic } from "#workflows/harness/shared/state/state-writer";

export const RALPLAN_COMPLETION_TRANSACTION_VERSION = 1;

export interface RalplanCompletionJournalStep {
	step: string;
	status: "pending" | "done" | "rolled_back";
	at?: string;
	error?: string;
}

export interface RalplanCompletionJournal {
	version: 1;
	type: "ralplan_completion";
	mutation_id: string;
	status: "pending" | "committed" | "rolled_back";
	session_id: string;
	run_id: string;
	stage: string;
	stage_n: number;
	role: string;
	artifact_path: string;
	artifact_sha256: string;
	snapshot_fingerprint: string;
	created_at: string;
	updated_at: string;
	paths: string[];
	steps: RalplanCompletionJournalStep[];
}

export function ralplanCompletionProvenancePath(artifactPath: string): string {
	return `${artifactPath}.completion.json`;
}

export function ralplanCompletionMutationId(input: {
	sessionId: string;
	runId: string;
	stage: string;
	stageN: number;
	role: string;
	artifactPath: string;
	artifactSha256: string;
}): string {
	const identity = JSON.stringify([
		input.sessionId,
		input.runId,
		input.stage,
		input.stageN,
		input.role,
		input.artifactPath,
		input.artifactSha256,
	]);
	let hash = 0x811c9dc5;
	for (let index = 0; index < identity.length; index += 1) {
		hash ^= identity.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `ralplan-completion-${hash.toString(16).padStart(8, "0")}-${input.artifactSha256.slice(0, 16)}`;
}

function journalPath(cwd: string, sessionId: string, mutationId: string): string {
	return transactionJournalPath(cwd, sessionId, mutationId);
}

async function readJournal(path: string): Promise<RalplanCompletionJournal> {
	return JSON.parse(await readFile(path, "utf8")) as RalplanCompletionJournal;
}

export async function beginRalplanCompletionJournal(
	input: Omit<RalplanCompletionJournal, "version" | "type" | "status" | "created_at" | "updated_at" | "steps"> & {
		cwd: string;
		steps: readonly string[];
	},
): Promise<string> {
	const now = nowIso();
	const filePath = journalPath(input.cwd, input.session_id, input.mutation_id);
	const journal: RalplanCompletionJournal = {
		version: 1,
		type: "ralplan_completion",
		mutation_id: input.mutation_id,
		status: "pending",
		session_id: input.session_id,
		run_id: input.run_id,
		stage: input.stage,
		stage_n: input.stage_n,
		role: input.role,
		artifact_path: input.artifact_path,
		artifact_sha256: input.artifact_sha256,
		snapshot_fingerprint: input.snapshot_fingerprint,
		created_at: now,
		updated_at: now,
		paths: input.paths,
		steps: input.steps.map((step) => ({ step, status: "pending" })),
	};
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(journal, null, 2)}\n`, { flag: "wx" });
	return filePath;
}

export async function markRalplanCompletionStep(
	cwd: string,
	sessionId: string,
	mutationId: string,
	step: string,
): Promise<void> {
	const path = journalPath(cwd, sessionId, mutationId);
	const journal = await readJournal(path);
	const now = nowIso();
	await writeFile(
		path,
		`${JSON.stringify({ ...journal, updated_at: now, steps: journal.steps.map((s) => (s.step === step ? { ...s, status: "done", at: now } : s)) }, null, 2)}\n`,
	);
}

export async function commitRalplanCompletionJournal(
	cwd: string,
	sessionId: string,
	mutationId: string,
): Promise<void> {
	const path = journalPath(cwd, sessionId, mutationId);
	const journal = await readJournal(path);
	const now = nowIso();
	await writeFile(path, `${JSON.stringify({ ...journal, status: "committed", updated_at: now }, null, 2)}\n`);
}

export async function recordRalplanRollback(input: {
	cwd: string;
	sessionId: string;
	mutationId: string;
	paths: string[];
	error: unknown;
}): Promise<void> {
	const path = journalPath(input.cwd, input.sessionId, input.mutationId);
	let journal: RalplanCompletionJournal | undefined;
	try {
		journal = await readJournal(path);
	} catch {
		return;
	}
	for (const target of input.paths.reverse()) {
		try {
			await rm(target, { force: true });
		} catch {
			// Best-effort rollback; the journal records evidence below.
		}
	}
	const now = nowIso();
	await writeFile(
		path,
		`${JSON.stringify({ ...journal, status: "rolled_back", updated_at: now, steps: [...journal.steps, { step: "rollback", status: "done", at: now, error: input.error instanceof Error ? input.error.message : String(input.error) }] }, null, 2)}\n`,
	);
}

export async function writeRalplanCompletionProvenance(input: {
	cwd: string;
	artifactPath: string;
	sessionId: string;
	runId: string;
	stage: string;
	stageN: number;
	role: string;
	artifactSha256: string;
	mutationId: string;
	actor: string;
	journalPath: string;
}): Promise<string> {
	const path = ralplanCompletionProvenancePath(input.artifactPath);
	await writeJsonAtomic(
		path,
		{
			version: RALPLAN_COMPLETION_TRANSACTION_VERSION,
			session_id: input.sessionId,
			run_id: input.runId,
			stage: input.stage,
			stage_n: input.stageN,
			role: input.role,
			artifact_path: input.artifactPath,
			artifact_sha256: input.artifactSha256,
			mutation_id: input.mutationId,
			actor: input.actor,
			journal_path: input.journalPath,
			created_at: nowIso(),
		},
		{ cwd: input.cwd },
	);
	return path;
}

export async function withRalplanCompletionLock<T>(
	cwd: string,
	sessionId: string,
	runId: string,
	fn: () => Promise<T>,
): Promise<T> {
	const lockPath = join(
		cwd,
		".pi",
		encodeURIComponent(sessionId).replaceAll(".", "%2E"),
		"plans",
		"ralplan",
		runId,
		".completion.lock",
	);
	return withFileMutationQueue(lockPath, async () => fn());
}

export function newRalplanCompletionAttemptId(): string {
	return randomUUID();
}
