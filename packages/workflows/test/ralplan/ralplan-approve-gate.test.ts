import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveRalplanPlan, doctorRalplan, writeRalplanArtifact } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * R-2 (targeted): `approveRalplanPlan` now enforces the latest critic verdict.
 * REJECT -> refuse (overrideable); ITERATE -> soft warning; APPROVE / no-critic
 * -> proceed. `doctorRalplan` surfaces the same signal as a warning while a plan
 * is pending. This is the first behavior-changing cut and the natural consumer of
 * the R-1 verdict parser.
 */
describe("ralplan approve gate — critic verdict enforcement (R-2)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-approve-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

	/** Write a critic artifact at stageN and a final artifact (to create pending approval). */
	async function seedRun(runId: string, criticStageN: number, criticArtifact: string, finalStageN: number) {
		await writeRalplanArtifact(
			cwd,
			{ runId, stage: "critic", stageN: criticStageN, artifact: criticArtifact },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId, stage: "final", stageN: finalStageN, artifact: "# Final Plan" },
			sessionId,
		);
	}

	it("approves when the latest critic verdict is APPROVE", async () => {
		await seedRun("run-a", 1, "## Verdict\nAPPROVE\n", 2);
		const result = await approveRalplanPlan(cwd, { runId: "run-a", target: "stop", sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("approve");
		expect(result.critic_verdict_overridden).toBeUndefined();
		expect(result.approval_warning).toBeUndefined();
	});

	it("refuses to approve when the latest critic verdict is REJECT", async () => {
		await seedRun("run-b", 1, "## Verdict\nREJECT\n", 2);
		await expect(approveRalplanPlan(cwd, { runId: "run-b", target: "stop", sessionId })).rejects.toThrow(
			/latest critic verdict is REJECT/,
		);
	});

	it("allows approving a REJECT'd plan with overrideCriticVerdict, recording the override", async () => {
		await seedRun("run-c", 1, "## Verdict\nREJECT\n", 2);
		const result = await approveRalplanPlan(cwd, {
			runId: "run-c",
			target: "stop",
			overrideCriticVerdict: true,
			sessionId,
		});
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("reject");
		expect(result.critic_verdict_overridden).toBe(true);
	});

	it("approves with a soft warning when the latest critic verdict is ITERATE", async () => {
		await seedRun("run-d", 1, "## Verdict\nITERATE\n", 2);
		const result = await approveRalplanPlan(cwd, { runId: "run-d", target: "stop", sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("iterate");
		expect(result.approval_warning).toMatch(/ITERATE/);
		expect(result.critic_verdict_overridden).toBeUndefined();
	});

	it("approves silently when there is no critic stage (backward compat)", async () => {
		// Final-only run: the existing default flow before the gate.
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-e", stage: "final", stageN: 1, artifact: "# Final Plan" },
			sessionId,
		);
		const result = await approveRalplanPlan(cwd, { runId: "run-e", target: "stop", sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBeUndefined();
		expect(result.approval_warning).toBeUndefined();
	});

	it("uses the LATEST critic verdict across multiple critic passes (APPROVE after ITERATE)", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-f", stage: "critic", stageN: 1, artifact: "## Verdict\nITERATE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-f", stage: "critic", stageN: 3, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-f", stage: "final", stageN: 4, artifact: "# Final Plan" },
			sessionId,
		);
		const result = await approveRalplanPlan(cwd, { runId: "run-f", target: "stop", sessionId });
		expect(result.critic_verdict).toBe("approve");
		expect(result.approval_warning).toBeUndefined();
	});

	it("refuses when the latest critic pass is REJECT even if an earlier pass APPROVEd", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-g", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-g", stage: "critic", stageN: 2, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-g", stage: "final", stageN: 3, artifact: "# Final Plan" },
			sessionId,
		);
		await expect(approveRalplanPlan(cwd, { runId: "run-g", target: "stop", sessionId })).rejects.toThrow(
			/latest critic verdict is REJECT/,
		);
	});

	it("rejections (approved=false) bypass the critic gate and report the verdict", async () => {
		await seedRun("run-h", 1, "## Verdict\nREJECT\n", 2);
		const result = await approveRalplanPlan(cwd, { runId: "run-h", target: "stop", approved: false, sessionId });
		expect(result.approved).toBe(false);
		expect(result.critic_verdict).toBe("reject");
		expect(result.critic_verdict_overridden).toBeUndefined();
	});

	it("doctor warns when a plan is pending approval with a REJECT critic verdict", async () => {
		await seedRun("run-i", 1, "## Verdict\nREJECT\n", 2);
		const doctor = await doctorRalplan(cwd, sessionId, "run-i");
		expect(doctor.warnings).toContain("pending approval but the latest critic verdict is REJECT");
	});
});
