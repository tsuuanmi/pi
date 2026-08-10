import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveRalplanPlan, doctorRalplan, writeRalplanArtifact } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * `approveRalplanPlan` requires an APPROVE verdict from the latest critic pass
 * before approving. ITERATE and REJECT both refuse approval. Rejections
 * (approved=false) bypass the gate and report the verdict.
 */
describe("ralplan approve gate — strict critic verdict enforcement", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-approve-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

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
		const result = await approveRalplanPlan(cwd, { runId: "run-a", target: "stop", approved: true, sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("approve");
	});

	it("refuses to approve when the latest critic verdict is REJECT", async () => {
		await seedRun("run-b", 1, "## Verdict\nREJECT\n", 2);
		await expect(
			approveRalplanPlan(cwd, { runId: "run-b", target: "stop", approved: true, sessionId }),
		).rejects.toThrow(/cannot approve ralplan without an APPROVE verdict/);
	});

	it("refuses to approve when the latest critic verdict is ITERATE", async () => {
		await seedRun("run-d", 1, "## Verdict\nITERATE\n", 2);
		await expect(
			approveRalplanPlan(cwd, { runId: "run-d", target: "stop", approved: true, sessionId }),
		).rejects.toThrow(/cannot approve ralplan without an APPROVE verdict/);
	});

	it("uses the latest critic verdict across multiple critic passes (APPROVE after ITERATE)", async () => {
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
		const result = await approveRalplanPlan(cwd, { runId: "run-f", target: "stop", approved: true, sessionId });
		expect(result.critic_verdict).toBe("approve");
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
		await expect(
			approveRalplanPlan(cwd, { runId: "run-g", target: "stop", approved: true, sessionId }),
		).rejects.toThrow(/cannot approve ralplan without an APPROVE verdict/);
	});

	it("rejections (approved=false) bypass the critic gate and report the verdict", async () => {
		await seedRun("run-h", 1, "## Verdict\nREJECT\n", 2);
		const result = await approveRalplanPlan(cwd, { runId: "run-h", target: "stop", approved: false, sessionId });
		expect(result.approved).toBe(false);
		expect(result.critic_verdict).toBe("reject");
	});

	it("doctor warns when a plan is pending approval with a non-APPROVE critic verdict", async () => {
		await seedRun("run-i", 1, "## Verdict\nREJECT\n", 2);
		const doctor = await doctorRalplan(cwd, sessionId, "run-i");
		expect(doctor.warnings).toContain("pending approval but the latest critic verdict is REJECT");
	});
});
