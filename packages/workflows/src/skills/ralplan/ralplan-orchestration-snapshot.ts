import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowTransactionJournal } from "#workflows/harness/shared/audit/transaction-journal";
import {
	transactionJournalPath,
	workflowActiveStatePath,
	workflowStatePath,
} from "#workflows/harness/shared/session/session-layout";
import { canonicalizeJson, sha256, workflowReceiptStatus } from "#workflows/harness/shared/state/state-writer";
import type { RalplanExplorerGate } from "#workflows/skills/ralplan/ralplan-gates";
import { readRalplanObstacleLedger, unresolvedRalplanObstacles } from "#workflows/skills/ralplan/ralplan-obstacles";
import type {
	RalplanIndexRow,
	RalplanInvalidIndexLine,
	RalplanStatus,
} from "#workflows/skills/ralplan/ralplan-runtime";
import { readRalplanStatus } from "#workflows/skills/ralplan/ralplan-runtime";

export const RALPLAN_ORCHESTRATION_SNAPSHOT_VERSION = 1;

export type RalplanHealth = "complete" | "missing" | "stale" | "invalid" | "diverged";
export type RalplanTransactionHealth = "none" | "stale_intent" | "partial_completion" | "rolled_back" | "complete";

export interface RalplanCompletionJournalLike {
	status?: string;
	type?: string;
	run_id?: string;
	steps?: { step?: string; status?: string }[];
}

export interface RalplanSnapshotIndexRow extends RalplanIndexRow {
	order: number;
}

export interface RalplanOrchestrationSnapshot {
	version: 1;
	skill: "ralplan";
	sessionId: string;
	runId?: string;
	statePath: string;
	activeStatePath: string;
	state: Record<string, unknown> | undefined;
	phase?: string;
	approval: { pending: boolean; path?: string; approved?: boolean };
	index: {
		path?: string;
		rows: RalplanSnapshotIndexRow[];
		invalidLines: RalplanInvalidIndexLine[];
		health: RalplanHealth;
	};
	explorerGate?: RalplanExplorerGate | { status: "invalid"; reason: string };
	artifactHealth: { health: RalplanHealth; problems: string[] };
	provenanceHealth: { health: RalplanHealth; problems: string[] };
	transactionJournal: { health: RalplanTransactionHealth; journals: RalplanCompletionJournalLike[] };
	obstacleHealth: { health: RalplanHealth; unresolved: number; problems: string[] };
	fingerprint: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value: unknown): string {
	return JSON.stringify(canonicalizeJson(value));
}

function normalizeRows(rows: readonly RalplanIndexRow[]): RalplanSnapshotIndexRow[] {
	return rows.map((row, index) => ({ ...row, order: index }));
}

async function fileSha(path: string): Promise<string | undefined> {
	try {
		return sha256(await readFile(path, "utf8"));
	} catch {
		return undefined;
	}
}

async function provenanceProblems(rows: readonly RalplanSnapshotIndexRow[]): Promise<string[]> {
	const problems: string[] = [];
	for (const row of rows) {
		const sidecarPath = `${row.path}.completion.json`;
		let parsed: unknown;
		try {
			parsed = JSON.parse(await readFile(sidecarPath, "utf8")) as unknown;
		} catch {
			problems.push(`missing sidecar for ${row.path}`);
			continue;
		}
		if (!isPlainObject(parsed)) {
			problems.push(`invalid sidecar for ${row.path}`);
			continue;
		}
		if (parsed.artifact_sha256 !== row.sha256) problems.push(`sidecar hash mismatch for ${row.path}`);
		if (parsed.stage !== row.stage || parsed.stage_n !== row.stage_n)
			problems.push(`sidecar stage mismatch for ${row.path}`);
	}
	return problems;
}

function snapshotWithoutFingerprint(snapshot: Omit<RalplanOrchestrationSnapshot, "fingerprint">): unknown {
	return snapshot;
}

function isCompletionJournal(value: unknown, runId: string | undefined): value is RalplanCompletionJournalLike {
	return (
		isPlainObject(value) &&
		value.type === "ralplan_completion" &&
		(!runId || value.run_id === runId) &&
		typeof value.status === "string"
	);
}

async function readRalplanCompletionJournals(input: {
	cwd: string;
	sessionId: string;
	runId?: string;
}): Promise<RalplanCompletionJournalLike[]> {
	const dir = dirname(transactionJournalPath(input.cwd, input.sessionId, "probe"));
	try {
		const files = await readdir(dir);
		const journals: RalplanCompletionJournalLike[] = [];
		for (const file of files.sort()) {
			if (!file.endsWith(".json")) continue;
			try {
				const parsed = JSON.parse(await readFile(`${dir}/${file}`, "utf8")) as unknown;
				if (isCompletionJournal(parsed, input.runId)) journals.push(parsed);
			} catch {
				journals.push({ status: "invalid", type: "ralplan_completion", run_id: input.runId, steps: [] });
			}
		}
		return journals;
	} catch {
		return [];
	}
}

function transactionHealth(journals: readonly RalplanCompletionJournalLike[]): RalplanTransactionHealth {
	if (journals.some((j) => j.status === "pending" && j.steps?.some((s) => s.status === "done"))) {
		return "partial_completion";
	}
	if (journals.some((j) => j.status === "pending")) return "stale_intent";
	if (journals.some((j) => j.status === "rolled_back" || j.steps?.some((s) => s.step === "rollback"))) {
		return "rolled_back";
	}
	if (journals.some((j) => j.status === "committed" || j.status === "complete")) return "complete";
	return "none";
}

export async function buildRalplanOrchestrationSnapshot(input: {
	cwd: string;
	sessionId: string;
	runId?: string;
	transactions?: RalplanCompletionJournalLike[] | WorkflowTransactionJournal[];
}): Promise<RalplanOrchestrationSnapshot> {
	const status: RalplanStatus = await readRalplanStatus(input.cwd, input.sessionId, input.runId);
	const rows = normalizeRows(status.rows);
	const artifactProblems: string[] = [];
	for (const row of rows) {
		const actual = await fileSha(row.path);
		if (!actual) artifactProblems.push(`missing artifact ${row.path}`);
		else if (actual !== row.sha256) artifactProblems.push(`sha256 mismatch for ${row.path}`);
	}
	const provenance = await provenanceProblems(rows);
	const ledger = status.run_id
		? await readRalplanObstacleLedger(input.cwd, status.run_id, input.sessionId)
		: { obstacles: [] };
	const unresolved = unresolvedRalplanObstacles(ledger);
	const receipt = isPlainObject(status.state?.receipt)
		? (status.state.receipt as { fresh_until?: string })
		: undefined;
	const staleReceipt = workflowReceiptStatus(receipt) === "stale";
	const journals = input.transactions ?? (await readRalplanCompletionJournals({ ...input, runId: status.run_id }));
	const journalHealth = transactionHealth(journals);
	const base: Omit<RalplanOrchestrationSnapshot, "fingerprint"> = {
		version: RALPLAN_ORCHESTRATION_SNAPSHOT_VERSION,
		skill: "ralplan",
		sessionId: input.sessionId,
		runId: status.run_id,
		statePath: workflowStatePath(input.cwd, "ralplan", input.sessionId),
		activeStatePath: workflowActiveStatePath(input.cwd, input.sessionId),
		state: status.state,
		phase: typeof status.state?.current_phase === "string" ? status.state.current_phase : undefined,
		approval: {
			pending: status.pending_approval,
			path: status.pending_approval_path,
			approved: typeof status.state?.approved === "boolean" ? status.state.approved : undefined,
		},
		index: {
			path: status.index_path,
			rows,
			invalidLines: [...status.invalid_index_lines].sort((a, b) => a.line - b.line),
			health: status.invalid_index_lines.length ? "invalid" : "complete",
		},
		explorerGate: isPlainObject(status.state?.explorer_gate)
			? (status.state.explorer_gate as unknown as RalplanExplorerGate)
			: status.state?.explorer_gate === undefined
				? undefined
				: { status: "invalid", reason: "explorer_gate is not an object" },
		artifactHealth: { health: artifactProblems.length ? "diverged" : "complete", problems: artifactProblems.sort() },
		provenanceHealth: { health: provenance.length ? "missing" : "complete", problems: provenance.sort() },
		transactionJournal: { health: journalHealth, journals },
		obstacleHealth: {
			health: unresolved.length ? "complete" : "complete",
			unresolved: unresolved.length,
			problems: staleReceipt ? ["stale receipt"] : [],
		},
	};
	return { ...base, fingerprint: sha256(canonicalText(snapshotWithoutFingerprint(base))) };
}
