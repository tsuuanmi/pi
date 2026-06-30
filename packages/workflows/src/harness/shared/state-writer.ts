import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent-core";
import { canonicalizeJson } from "./canonical-json.ts";

export { canonicalizeJson };

export interface WriteArtifactResult {
	path: string;
	sha256: string;
	createdAt: string;
}

export type StrictMutationReadResult =
	| { kind: "absent" }
	| { kind: "corrupt"; error: string }
	| { kind: "valid"; value: Record<string, unknown> };

export interface WorkflowWriteOptions {
	cwd?: string;
}

export interface JsonlIdempotentOptions extends WorkflowWriteOptions {
	key?: (entry: unknown) => string | undefined;
	equals?: (a: unknown, b: unknown) => boolean;
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertPiTargetPath(targetPath: string, cwd: string | undefined): void {
	if (!cwd) return;
	const projectRoot = resolve(cwd);
	const piRoot = resolve(projectRoot, ".pi");
	const target = resolve(targetPath);
	const rel = relative(piRoot, target);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`target path must be within project .pi/**: ${targetPath}`);
	}
}

export async function readExistingStateForMutation(filePath: string): Promise<StrictMutationReadResult> {
	try {
		const raw = await readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (isPlainObject(parsed)) return { kind: "valid", value: parsed };
		return { kind: "corrupt", error: "state file must contain a JSON object" };
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return { kind: "absent" };
		if (error instanceof SyntaxError) return { kind: "corrupt", error: error.message };
		return { kind: "corrupt", error: err.message };
	}
}

function withoutReceiptChecksum(value: unknown): unknown {
	if (!isPlainObject(value)) return value;
	const clone: Record<string, unknown> = { ...value };
	if (isPlainObject(clone.receipt)) {
		const receipt = { ...clone.receipt };
		delete receipt.content_sha256;
		clone.receipt = receipt;
	}
	return clone;
}

export function workflowEnvelopeContentSha256(value: unknown): string {
	return sha256(JSON.stringify(canonicalizeJson(withoutReceiptChecksum(value))));
}

export function stampWorkflowEnvelopeChecksum<T>(value: T, filePath: string, computedAt = nowIso()): T {
	if (!isPlainObject(value)) return value;
	const envelope: Record<string, unknown> = { ...value };
	const receipt = isPlainObject(envelope.receipt) ? { ...envelope.receipt } : {};
	envelope.receipt = {
		...receipt,
		content_sha256: {
			algorithm: "sha256",
			value: workflowEnvelopeContentSha256(envelope),
			covered_path: filePath,
			computed_at: computedAt,
		},
	};
	return envelope as T;
}

/** Receipt freshness window: 30 minutes. Entries older than this are stale. */
export const WORKFLOW_RECEIPT_FRESH_MS = 30 * 60 * 1000;

export type WorkflowReceiptStatus = "fresh" | "stale";

export function createWorkflowReceipt(input: {
	skill: string;
	statePath: string;
	command: string;
	mutatedAt: string;
	mutationId?: string;
	forced?: boolean;
	operation?: string;
}): Record<string, unknown> {
	const freshUntil = new Date(Date.parse(input.mutatedAt) + WORKFLOW_RECEIPT_FRESH_MS).toISOString();
	return {
		version: 1,
		skill: input.skill,
		owner: "pi-workflow",
		command: input.command,
		state_path: input.statePath,
		storage_path: input.statePath,
		mutated_at: input.mutatedAt,
		fresh_until: freshUntil,
		status: "fresh" as WorkflowReceiptStatus,
		mutation_id: input.mutationId ?? randomUUID(),
		...(input.forced ? { forced: true } : {}),
		...(input.operation ? { operation: input.operation } : {}),
	};
}

/**
 * Check whether a receipt is fresh or stale based on its `fresh_until` timestamp.
 * Returns undefined when the receipt or timestamp is missing/malformed.
 */
export function workflowReceiptStatus(
	receipt: { fresh_until?: string } | undefined,
	nowMs: number = Date.now(),
): WorkflowReceiptStatus | undefined {
	if (!receipt?.fresh_until) return undefined;
	const freshUntilMs = Date.parse(receipt.fresh_until);
	if (!Number.isFinite(freshUntilMs)) return "stale";
	return nowMs <= freshUntilMs ? "fresh" : "stale";
}

/**
 * Check whether an `updated_at` timestamp is within the freshness window.
 * Used for active-state entries that don't carry a full receipt.
 */
export function isEntryStale(updatedAt: string | undefined, nowMs: number = Date.now()): boolean {
	if (!updatedAt) return true;
	const ms = Date.parse(updatedAt);
	if (!Number.isFinite(ms)) return true;
	return nowMs > ms + WORKFLOW_RECEIPT_FRESH_MS;
}

export async function writeJsonAtomic(
	path: string,
	value: Record<string, unknown>,
	options: WorkflowWriteOptions = {},
): Promise<void> {
	assertPiTargetPath(path, options.cwd);
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, path);
	});
}

/**
 * Resolve a workflow input that may be either a file path or literal content.
 *
 * Only attempt the file-path interpretation when `raw` plausibly looks like a
 * path: a single line (no newlines) and short enough to be a real path component.
 * Multi-line markdown or any string exceeding the platform path/name length
 * limits is treated as literal content, avoiding `ENAMETOOLONG` (and other
 * non-ENOENT/ENOTDIR stat errors) from being thrown for large inline blobs.
 */
export async function readFileOrLiteral(raw: string, cwd: string): Promise<string> {
	// Inline content (newlines) or anything far exceeding path length limits is
	// literal; never send it to stat (which would throw ENAMETOOLONG).
	if (raw.includes("\n") || raw.length > MAX_PATH_PLAUSIBLE_LENGTH) {
		return raw;
	}
	const candidate = isAbsolute(raw) ? raw : resolve(cwd, raw);
	try {
		const info = await stat(candidate);
		if (info.isFile()) return readFile(candidate, "utf8");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		// ENOENT/ENOTDIR: not a file path, treat as literal. Any other stat error
		// (e.g. ENAMETOOLONG for an over-long single-line string) also means "not a
		// file path"; fall through to literal rather than throwing.
		if (err.code !== "ENOENT" && err.code !== "ENOTDIR" && err.code !== "ENAMETOOLONG") throw error;
	}
	return raw;
}

/** Strings longer than this are treated as literal content, not file paths. */
const MAX_PATH_PLAUSIBLE_LENGTH = 4096;

export async function writeTextArtifact(
	path: string,
	content: string,
	options: WorkflowWriteOptions = {},
): Promise<WriteArtifactResult> {
	assertPiTargetPath(path, options.cwd);
	const body = content.endsWith("\n") ? content : `${content}\n`;
	return withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, body, "utf8");
		return { path, sha256: sha256(body), createdAt: nowIso() };
	});
}

export async function appendJsonl(
	path: string,
	row: Record<string, unknown>,
	options: WorkflowWriteOptions = {},
): Promise<void> {
	assertPiTargetPath(path, options.cwd);
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		let existing = "";
		try {
			existing = await readFile(path, "utf8");
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code !== "ENOENT") throw error;
		}
		await writeFile(path, `${existing}${JSON.stringify(row)}\n`, "utf8");
	});
}

function parseJsonlLine(line: string): unknown | undefined {
	const trimmed = line.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return undefined;
	}
}

export async function appendJsonlIdempotent(
	path: string,
	row: Record<string, unknown>,
	options: JsonlIdempotentOptions,
): Promise<{ appended: boolean }> {
	if (!options.key && !options.equals) {
		throw new Error("appendJsonlIdempotent requires key or equals");
	}
	assertPiTargetPath(path, options.cwd);
	return withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		let existing = "";
		try {
			existing = await readFile(path, "utf8");
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code !== "ENOENT") throw error;
		}
		const rowKey = options.key?.(row);
		for (const line of existing.split(/\r?\n/)) {
			const parsed = parseJsonlLine(line);
			if (parsed === undefined) continue;
			if (rowKey !== undefined && options.key?.(parsed) === rowKey) return { appended: false };
			if (options.equals?.(parsed, row)) return { appended: false };
		}
		await writeFile(path, `${existing}${JSON.stringify(row)}\n`, "utf8");
		return { appended: true };
	});
}
