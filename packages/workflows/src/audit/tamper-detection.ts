import { readFile } from "node:fs/promises";
import { appendAuditEntry } from "#workflows/audit/audit-log";
import type { WorkflowSkill } from "#workflows/registry/workflow-manifest-types";
import { workflowEnvelopeContentSha256 } from "#workflows/state/state-writer";

export interface WorkflowEnvelopeIntegrityMismatch {
	path: string;
	expected: string;
	actual: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function assertStateIntegrity(
	cwd: string,
	filePath: string,
	skill: WorkflowSkill,
	context: { mutationId: string; sessionId: string },
): Promise<void> {
	let raw: string;
	try {
		raw = await readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`workflow state is not valid JSON: ${filePath}`);
	}
	if (!isRecord(parsed)) throw new Error(`workflow state must be an object: ${filePath}`);
	const receipt = isRecord(parsed.receipt) ? parsed.receipt : undefined;
	const checksum = receipt && isRecord(receipt.content_sha256) ? receipt.content_sha256 : undefined;
	const expected = checksum?.value;
	if (typeof expected !== "string" || expected.length === 0) return;
	const actual = workflowEnvelopeContentSha256(parsed);
	if (actual === expected) return;

	await appendAuditEntry(cwd, context.sessionId, {
		ts: new Date().toISOString(),
		skill,
		category: "state",
		verb: "out_of_band_detected",
		owner: "pi-workflow",
		mutation_id: context.mutationId,
		paths: [filePath],
		expected_sha256: expected,
		actual_sha256: actual,
		session_id: context.sessionId,
	});
	throw new Error(
		`out-of-band edit detected for ${skill}: ${filePath} expected sha256 ${expected} but found ${actual}`,
	);
}
