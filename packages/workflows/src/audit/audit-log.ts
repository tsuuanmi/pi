import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowSkill } from "#workflows/session/paths";
import { auditLogPath } from "#workflows/session/paths";

export type AuditCategory = "state" | "artifact" | "report" | "log" | "prune";

export type AuditStateVerb =
	| "write"
	| "clear"
	| "handoff"
	| "reconcile"
	| "out_of_band_detected"
	| "invalid_transition_detected";

export interface AuditEntry {
	ts: string;
	skill?: WorkflowSkill;
	category: AuditCategory;
	verb: string;
	owner: string;
	mutation_id: string;
	from_phase?: string;
	to_phase?: string;
	paths: string[];
	expected_sha256?: string;
	actual_sha256?: string;
	session_id?: string;
}

export async function appendAuditEntry(cwd: string, sessionId: string, entry: AuditEntry): Promise<void> {
	const filePath = auditLogPath(cwd, sessionId);
	await mkdir(dirname(filePath), { recursive: true });
	await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function auditVerbForOperation(operation: string | undefined): AuditStateVerb {
	switch (operation) {
		case "clear":
			return "clear";
		case "handoff-send":
		case "handoff-receive":
			return "handoff";
		default:
			return "write";
	}
}

export async function auditStateWrite(input: {
	cwd: string;
	skill: WorkflowSkill;
	path: string;
	verb: AuditStateVerb;
	mutationId: string;
	fromPhase?: string;
	toPhase?: string;
	owner?: string;
	sessionId: string;
}): Promise<void> {
	try {
		await appendAuditEntry(input.cwd, input.sessionId, {
			ts: new Date().toISOString(),
			skill: input.skill,
			category: "state",
			verb: input.verb,
			owner: input.owner ?? "pi-workflow",
			mutation_id: input.mutationId,
			...(input.fromPhase ? { from_phase: input.fromPhase } : {}),
			...(input.toPhase ? { to_phase: input.toPhase } : {}),
			paths: [input.path],
			session_id: input.sessionId,
		});
	} catch {
		// Audit append is best-effort: a sanctioned write must not fail when the audit log is unwritable.
	}
}
