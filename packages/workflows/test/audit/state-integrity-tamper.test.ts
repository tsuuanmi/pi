import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionAuditPath, skillStatePath } from "@tsuuanmi/pi/session/layout";
import { type AuditEntry, readWorkflowState, writeWorkflowState } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

async function readAudit(cwd: string): Promise<AuditEntry[]> {
	try {
		const raw = await readFile(sessionAuditPath(cwd, sessionId), "utf8");
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

async function tamperEnvelope(
	cwd: string,
	skill: "ultragoal",
	mutate: (value: Record<string, unknown>) => void,
): Promise<void> {
	const filePath = skillStatePath(cwd, skill, sessionId);
	const raw = await readFile(filePath, "utf8");
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	mutate(parsed);
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

	it("clean write stamps a checksum and emits no out_of_band_detected", async () => {
		await writeWorkflowState(
			cwd,
			"ultragoal",
			{ active: true, current_phase: "approved-execution" },
			"pi workflow state write",
			{ sessionId },
		);

		const state = await readWorkflowState(cwd, "ultragoal", { sessionId });
		const checksum = (state?.receipt as Record<string, unknown>).content_sha256 as
			| Record<string, unknown>
			| undefined;
		expect(checksum?.value).toEqual(expect.any(String));
		expect((checksum?.value as string).length).toBe(64);

		const audit = await readAudit(cwd);
		expect(audit.filter((e) => e.verb === "out_of_band_detected")).toHaveLength(0);
		expect(audit.filter((e) => e.verb === "write")).toHaveLength(1);
	});

	it("out-of-band edit hard-blocks the next write and audits out_of_band_detected", async () => {
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

		await tamperEnvelope(cwd, "ultragoal", (value) => {
			value.current_phase = "active";
		});

		await expect(
			writeWorkflowState(cwd, "ultragoal", { current_phase: "active" }, "pi workflow state write", { sessionId }),
		).rejects.toThrow(/out-of-band edit detected for ultragoal/);

		const outOfBand = (await readAudit(cwd)).filter((e) => e.verb === "out_of_band_detected");
		expect(outOfBand).toHaveLength(1);
		expect(outOfBand[0].skill).toBe("ultragoal");
		expect(outOfBand[0].expected_sha256).toBe(expectedSha);
		expect(typeof outOfBand[0].actual_sha256).toBe("string");
		expect(outOfBand[0].actual_sha256).not.toBe(expectedSha);
	});
});
