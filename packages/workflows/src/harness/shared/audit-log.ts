import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowSkill } from "./paths.ts";
import { auditLogPath } from "./paths.ts";

/**
 * State-integrity audit log.
 *
 * Session-scoped JSONL trail at `.pi/{session}/state/audit.jsonl` (mirrors
 * Gajae's session-scoped audit layout). This milestone implements the `state`-integrity
 * coverage seam: every workflow mode-state write/clear/handoff/reconcile,
 * plus `out_of_band_detected` (tamper), `invalid_transition_detected`, and
 * `force_overwrite`. The schema is Gajae-faithful so the deferred
 * `artifact`/`report`/`log`/`prune` categories slot in without a migration.
 *
 * Best-effort: {@link appendAuditEntry} never throws out of a sanctioned write
 * path — callers wrap mutations in {@link safeAppendAuditEntry} so an audit
 * failure (e.g. read-only `.pi/state`) degrades to stderr, not a failed write.
 * An audit call that precedes a throw (e.g. `invalid_transition_detected`)
 * must never suppress that throw.
 */

export type AuditCategory = "state" | "artifact" | "report" | "log" | "prune" | "force";

export type AuditStateVerb =
	| "write"
	| "clear"
	| "handoff"
	| "reconcile"
	| "out_of_band_detected"
	| "invalid_transition_detected"
	| "force_overwrite";

/** Gajae-faithful audit entry. `expected_sha256`/`actual_sha256` for tamper rows. */
export interface AuditEntry {
	ts: string;
	skill?: WorkflowSkill;
	category: AuditCategory;
	verb: string;
	owner: string;
	mutation_id: string;
	from_phase?: string;
	to_phase?: string;
	forced?: boolean;
	paths: string[];
	expected_sha256?: string;
	actual_sha256?: string;
	/** Session id for session-scoped audit entries. */
	session_id?: string;
}

/** Append one audit line to `.pi/{session}/state/audit.jsonl`. Throws on I/O failure. */
export async function appendAuditEntry(cwd: string, sessionId: string, entry: AuditEntry): Promise<void> {
	const filePath = auditLogPath(cwd, sessionId);
	await mkdir(dirname(filePath), { recursive: true });
	await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Best-effort audit append. Swallows I/O failures (writes a short notice to
 * stderr) so a sanctioned state write never fails because the audit log was
 * unwritable. Returns true on success, false on swallowed failure.
 */
export async function safeAppendAuditEntry(cwd: string, sessionId: string, entry: AuditEntry): Promise<boolean> {
	try {
		await appendAuditEntry(cwd, sessionId, entry);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`workflow audit append failed (${entry.category}/${entry.verb}): ${message}\n`);
		return false;
	}
}

/** Map a workflow state operation to the Gajae-faithful audit verb. */
export function auditVerbForOperation(operation: string | undefined): AuditStateVerb {
	switch (operation) {
		case "clear":
			return "clear";
		case "handoff-send":
		case "handoff-receive":
			return "handoff";
		case "force-repair":
			return "reconcile";
		default:
			return "write";
	}
}

/** Append the `state`/`<verb>` row that records a sanctioned mode-state write. */
export async function maybeAuditForStateWrite(input: {
	cwd: string;
	skill: WorkflowSkill;
	path: string;
	verb: AuditStateVerb;
	mutationId: string;
	fromPhase?: string;
	toPhase?: string;
	forced: boolean;
	owner?: string;
	sessionId: string;
}): Promise<void> {
	await safeAppendAuditEntry(input.cwd, input.sessionId, {
		ts: new Date().toISOString(),
		skill: input.skill,
		category: "state",
		verb: input.verb,
		owner: input.owner ?? "pi-workflow",
		mutation_id: input.mutationId,
		...(input.fromPhase ? { from_phase: input.fromPhase } : {}),
		...(input.toPhase ? { to_phase: input.toPhase } : {}),
		forced: input.forced,
		paths: [input.path],
		session_id: input.sessionId,
	});
}

/** In-memory fail-soft error record (collected at call sites; durable trail in the audit log). */
export interface FailSoftError {
	site: string;
	message: string;
	ts: string;
}

/**
 * Record a fail-soft error to the audit log (category "log", verb "fail_soft_error")
 * and return the in-memory record. Never throws: wraps {@link safeAppendAuditEntry}
 * so a fail-soft path never fails the operation it guards. The audit row is the
 * durable source of truth; callers surface a count on their receipt from the
 * in-memory {@link FailSoftError}[] they collect.
 */
export async function recordFailSoftError(
	cwd: string,
	sessionId: string,
	input: { site: string; message: string; skill?: WorkflowSkill },
	nowIso?: string,
): Promise<FailSoftError> {
	const ts = nowIso ?? new Date().toISOString();
	await safeAppendAuditEntry(cwd, sessionId, {
		ts,
		...(input.skill ? { skill: input.skill } : {}),
		category: "log",
		verb: "fail_soft_error",
		owner: "pi-workflow",
		mutation_id: "",
		paths: [],
		session_id: sessionId,
	});
	return { site: input.site, message: input.message, ts };
}
