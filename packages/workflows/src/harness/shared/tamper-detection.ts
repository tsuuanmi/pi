import { readFile } from "node:fs/promises";
import { safeAppendAuditEntry } from "./audit-log.ts";
import type { WorkflowSkill } from "./paths.ts";
import { workflowEnvelopeContentSha256 } from "./state-writer.ts";

/**
 * Workflow mode-state tamper detection.
 *
 * Pi stamps `content_sha256` on every workflow mode-state envelope but
 * historically never verified it. This module recomputes the content hash of
 * the on-disk envelope (excluding the receipt checksum itself, via the shared
 * {@link workflowEnvelopeContentSha256} entry point) and compares it to the
 * stored checksum. A mismatch means the file was edited out-of-band.
 *
 * Enforcement is Gajae-faithful: detect → append an `out_of_band_detected`
 * audit entry → **hard-block** the unforced write (throw). An internal `force`
 * flag bypasses the throw (the audit entry is appended regardless, with
 * `forced:true`); the caller re-stamps a fresh checksum and appends a
 * `force_overwrite` audit entry. Force is internal-only (no public verb).
 *
 * A brand-new envelope (no file, or no stored `content_sha256`) is clean —
 * there is nothing to compare, so the very first write for a skill never
 * false-positives as tampered.
 */

export interface WorkflowEnvelopeIntegrityMismatch {
	path: string;
	expected: string;
	actual: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recompute the envelope content hash and compare to the stored
 * `receipt.content_sha256.value`. Returns `undefined` when the file is absent,
 * unparseable, or has no stored checksum (clean — nothing to compare).
 */
export async function detectWorkflowEnvelopeIntegrityMismatch(
	filePath: string,
): Promise<WorkflowEnvelopeIntegrityMismatch | undefined> {
	let raw: string;
	try {
		raw = await readFile(filePath, "utf8");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return undefined;
		// Unreadable for any other reason: fail-open (no recoverable checksum).
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		// Corrupt JSON has no recoverable checksum; the strict mutation reader
		// already gates unforced overwrites. Fail-open here.
		return undefined;
	}
	if (!isPlainObject(parsed)) return undefined;
	const receipt = parsed.receipt;
	if (!isPlainObject(receipt)) return undefined;
	const checksum = receipt.content_sha256;
	if (!isPlainObject(checksum)) return undefined;
	const expected = checksum.value;
	if (typeof expected !== "string" || !expected) return undefined;
	const actual = workflowEnvelopeContentSha256(parsed);
	return actual === expected ? undefined : { path: filePath, expected, actual };
}

/**
 * Detect an out-of-band edit; on mismatch, append an `out_of_band_detected`
 * audit entry and throw the Gajae-style message when the write is unforced.
 *
 * The audit entry is appended **regardless** of force (so the detection is
 * durable even when the write is blocked, and recorded with `forced:true` when
 * bypassed). The `force_overwrite` entry is the caller's responsibility — it
 * fires on every forced write, not only tamper repairs.
 *
 * Returns `true` when a mismatch was detected (so callers/tests can observe
 * it); returns `false` when the envelope is clean.
 */
export async function auditOutOfBandAndThrowIfUnforced(
	cwd: string,
	filePath: string,
	skill: WorkflowSkill,
	options: { mutationId: string; forced: boolean; sessionId: string },
): Promise<boolean> {
	let mismatch: WorkflowEnvelopeIntegrityMismatch | undefined;
	try {
		mismatch = await detectWorkflowEnvelopeIntegrityMismatch(filePath);
	} catch {
		// Unreadable state has no recoverable checksum; fail-open.
		return false;
	}
	if (!mismatch) return false;
	await safeAppendAuditEntry(cwd, options.sessionId, {
		ts: new Date().toISOString(),
		skill,
		category: "state",
		verb: "out_of_band_detected",
		owner: "pi-workflow",
		mutation_id: options.mutationId,
		forced: options.forced,
		paths: [filePath],
		expected_sha256: mismatch.expected,
		actual_sha256: mismatch.actual,
		session_id: options.sessionId,
	});
	if (!options.forced) {
		throw new Error(
			`out-of-band edit detected for ${skill}: ${filePath} expected sha256 ${mismatch.expected} but found ${mismatch.actual}; use --force to overwrite tampered mode-state`,
		);
	}
	return true;
}
