import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AuditEntry, auditLogPath, writeWorkflowState } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

async function readAudit(cwd: string): Promise<AuditEntry[]> {
	try {
		const raw = await readFile(auditLogPath(cwd, sessionId), "utf8");
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as AuditEntry);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return [];
		throw error;
	}
}

function assertAuditEntryShape(entry: AuditEntry): void {
	expect(typeof entry.ts).toBe("string");
	expect(entry.category).toBe("state");
	expect(typeof entry.verb).toBe("string");
	expect(typeof entry.owner).toBe("string");
	expect(typeof entry.mutation_id).toBe("string");
	expect(Array.isArray(entry.paths)).toBe(true);
}

describe("state-integrity audit log (STATE-005)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("audits every sanctioned mode-state write with the Gajae-faithful schema", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);
		await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "pi workflow state write", {
			sessionId,
		});

		const entries = await readAudit(cwd);
		// Two sanctioned writes, both verb "write".
		const writes = entries.filter((e) => e.verb === "write");
		expect(writes).toHaveLength(2);
		for (const entry of writes) {
			assertAuditEntryShape(entry);
			expect(entry.skill).toBe("ultragoal");
			expect(entry.paths.length).toBe(1);
		}
		expect(writes[0].to_phase).toBe("approved-execution");
		expect(writes[1].from_phase).toBe("approved-execution");
		expect(writes[1].to_phase).toBe("pending");
	});

	it("emits invalid_transition_detected then throws on an unforced non-manifest-edge transition", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);

		// approved-execution -> complete is not a manifest edge for operation "write".
		await expect(
			writeWorkflowState(cwd, "ultragoal", { current_phase: "complete" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/transition is not allowed by workflow manifest/);

		const entries = await readAudit(cwd);
		const invalid = entries.find((e) => e.verb === "invalid_transition_detected");
		expect(invalid).toBeDefined();
		expect(invalid?.skill).toBe("ultragoal");
		expect(invalid?.from_phase).toBe("approved-execution");
		expect(invalid?.to_phase).toBe("complete");
		expect(invalid?.forced).toBe(false);
		// The blocked write did NOT emit a `write` audit for the second attempt.
		const writes = entries.filter((e) => e.verb === "write");
		expect(writes).toHaveLength(1);
	});

	it("best-effort: an unwritable audit log does not fail a sanctioned write", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);
		const auditFile = auditLogPath(cwd, sessionId);
		const before = await readAudit(cwd);
		expect(before).toHaveLength(1);

		// Make the audit log file read-only so appendAuditEntry's appendFile fails.
		await chmod(auditFile, 0o400);
		try {
			// The sanctioned write must still succeed (audit append is best-effort).
			const state = await writeWorkflowState(
				cwd,
				"ultragoal",
				{ current_phase: "pending" },
				"pi workflow state write",
				{ sessionId },
			);
			expect(state.current_phase).toBe("pending");
			const after = await readAudit(cwd);
			// No new audit line could be appended (file read-only).
			expect(after).toHaveLength(1);
		} finally {
			await chmod(auditFile, 0o600);
		}
	});
});
