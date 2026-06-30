import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	auditLogPath,
	type AuditEntry,
	readWorkflowState,
	workflowStatePath,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";

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

/** Rewrite a mode-state envelope with a mutated field but the SAME (now-stale) checksum. */
async function tamperEnvelope(
	cwd: string,
	skill: "ultragoal",
	mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
	const filePath = workflowStatePath(cwd, skill, sessionId);
	const raw = await readFile(filePath, "utf8");
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	mutate(parsed);
	// Preserve receipt.content_sha256 exactly (the stale value to detect).
	await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

describe("state-integrity tamper detection (STATE-004)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-tamper-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("clean write stamps a checksum and emits no out_of_band_detected (first-ever write has no prior checksum)", async () => {
		// First-ever write to a skill with no prior envelope → no checksum to compare.
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);

		const state = await readWorkflowState(cwd, "ultragoal", { sessionId });
		expect(state?.receipt).toBeDefined();
		const checksum = (state?.receipt as Record<string, unknown>).content_sha256 as
			| Record<string, unknown>
			| undefined;
		expect(checksum?.value).toEqual(expect.any(String));
		expect((checksum?.value as string).length).toBe(64);

		const audit = await readAudit(cwd);
		expect(audit.filter((e) => e.verb === "out_of_band_detected")).toHaveLength(0);
		// The sanctioned write itself is audited.
		expect(audit.filter((e) => e.verb === "write")).toHaveLength(1);
	});

	it("unforced write after an out-of-band edit hard-blocks and audits out_of_band_detected", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);
		const beforeTamper = await readWorkflowState(cwd, "ultragoal", { sessionId });
		const expectedSha = ((beforeTamper?.receipt as Record<string, unknown>).content_sha256 as Record<string, unknown>)
			.value as string;

		// Out-of-band edit: change a field without updating the checksum.
		await tamperEnvelope(cwd, "ultragoal", (value) => {
			value.current_phase = "active";
		});

		await expect(
			writeWorkflowState(cwd, "ultragoal", { current_phase: "active" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/out-of-band edit detected for ultragoal.*use --force to overwrite tampered mode-state/);

		const outOfBand = (await readAudit(cwd)).filter((e) => e.verb === "out_of_band_detected");
		expect(outOfBand).toHaveLength(1);
		expect(outOfBand[0].skill).toBe("ultragoal");
		expect(outOfBand[0].forced).toBe(false);
		expect(outOfBand[0].expected_sha256).toBe(expectedSha);
		expect(typeof outOfBand[0].actual_sha256).toBe("string");
		expect(outOfBand[0].actual_sha256).not.toBe(expectedSha);
	});

	it("forced write after tamper proceeds, re-stamps, and emits the three-entry audit sequence", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);
		await tamperEnvelope(cwd, "ultragoal", (value) => {
			value.current_phase = "pending";
		});

		// Force bypass re-stamps a fresh checksum and audits force_overwrite.
		const stamped = await writeWorkflowState(
			cwd,
			"ultragoal",
			{ current_phase: "pending" },
			"pi workflow state write",
			{
				operation: "write",
				force: true,
				sessionId,
			},
		);
		const newSha = ((stamped.receipt as Record<string, unknown>).content_sha256 as Record<string, unknown>)
			.value as string;
		expect(newSha.length).toBe(64);

		const verbs = (await readAudit(cwd)).map((e) => e.verb);
		// out_of_band_detected (forced:true, before) -> write (forced:true) -> force_overwrite
		expect(verbs).toEqual(["write", "out_of_band_detected", "write", "force_overwrite"]);
		const entries = await readAudit(cwd);
		const oob = entries.find((e) => e.verb === "out_of_band_detected");
		expect(oob?.forced).toBe(true);
		const forcedWrite = entries.filter((e) => e.verb === "write")[1];
		expect(forcedWrite?.forced).toBe(true);
		const forceOverwrite = entries.find((e) => e.verb === "force_overwrite");
		expect(forceOverwrite?.forced).toBe(true);
	});

	it("forced write with no mismatch emits the two-entry audit sequence", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);

		await writeWorkflowState(cwd, "ultragoal", { current_phase: "pending" }, "pi workflow state write", {
			operation: "write",
			force: true,
			sessionId,
		});

		const entries = await readAudit(cwd);
		const verbs = entries.map((e) => e.verb);
		// First clean write -> write (forced:false). Forced clean write -> write (forced:true) -> force_overwrite.
		expect(verbs).toEqual(["write", "write", "force_overwrite"]);
		expect(entries.filter((e) => e.verb === "out_of_band_detected")).toHaveLength(0);
		const forcedWrite = entries.filter((e) => e.verb === "write")[1];
		expect(forcedWrite?.forced).toBe(true);
		const forceOverwrite = entries.find((e) => e.verb === "force_overwrite");
		expect(forceOverwrite?.forced).toBe(true);
	});
});
