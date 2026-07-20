import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	approveRalplanPlan,
	buildRalplanObstacle,
	doctorRalplan,
	ralplanObstacleLedgerPath,
	readRalplanObstacleLedger,
	writeRalplanArtifact,
	writeRalplanObstacle,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionId = "test-session-id";

/**
 * Phase R-2 (ralplan obstacle-mirror of B-1): `approveRalplanPlan` and
 * `doctorRalplan` read the obstacle ledger alongside the verdict and assert
 * agreement (dev-throw / doctor-warn). The check is scoped to the LATEST critic
 * pass's artifact, so stale active obstacles from earlier revision passes (R-1
 * never resolves) do not read as divergence.
 */
describe("ralplan obstacle agreement (R-2)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-r2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("approve throws in dev when the ledger disagrees with an APPROVE verdict (forged obstacle)", async () => {
		const critic = await writeRalplanArtifact(
			cwd,
			{ runId: "run-a", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		// APPROVE writes no obstacle; forge a stale plan_rejected for that pass.
		await writeRalplanObstacle(
			cwd,
			"run-a",
			sessionId,
			buildRalplanObstacle(
				{
					kind: "plan_rejected",
					name: "forged",
					status: "active",
					scope: { planRef: critic.path },
					originRef: critic.path,
				},
				"now",
			),
		);
		await writeRalplanArtifact(cwd, { runId: "run-a", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		await expect(approveRalplanPlan(cwd, { runId: "run-a", target: "stop", sessionId })).rejects.toThrow(
			/divergence/,
		);
	});

	it("approve does not throw on divergence in production (warns instead)", async () => {
		const critic = await writeRalplanArtifact(
			cwd,
			{ runId: "run-b", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanObstacle(
			cwd,
			"run-b",
			sessionId,
			buildRalplanObstacle(
				{
					kind: "plan_rejected",
					name: "forged",
					status: "active",
					scope: { planRef: critic.path },
					originRef: critic.path,
				},
				"now",
			),
		);
		await writeRalplanArtifact(cwd, { runId: "run-b", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		process.env.NODE_ENV = "production";
		try {
			const result = await approveRalplanPlan(cwd, { runId: "run-b", target: "stop", sessionId });
			expect(result.approved).toBe(true);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining("divergence"));
		} finally {
			process.env.NODE_ENV = "test";
			warn.mockRestore();
		}
	});

	it("approve skips the agreement check when the ledger is empty (pre-R-1 / fail-soft path)", async () => {
		// REJECT critic (R-1 writes plan_rejected), then delete the ledger to
		// simulate a pre-R-1 run or a fail-soft swallowed write.
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-c", stage: "critic", stageN: 1, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-c", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		await rm(ralplanObstacleLedgerPath(cwd, "run-c", sessionId), { force: true });
		const result = await approveRalplanPlan(cwd, {
			runId: "run-c",
			target: "stop",
			overrideCriticVerdict: true,
			sessionId,
		});
		expect(result.approved).toBe(true);
		expect(result.critic_verdict_overridden).toBe(true);
	});

	it("approve agrees on a clean REJECT+override (no divergence)", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-d", stage: "critic", stageN: 1, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-d", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		const result = await approveRalplanPlan(cwd, {
			runId: "run-d",
			target: "stop",
			overrideCriticVerdict: true,
			sessionId,
		});
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("reject");
	});

	it("agreement holds across a revision loop (ITERATE then APPROVE): the stale ITERATE obstacle is ignored", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-e", stage: "critic", stageN: 1, artifact: "## Verdict\nITERATE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-e", stage: "critic", stageN: 2, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-e", stage: "final", stageN: 3, artifact: "# Final" }, sessionId);
		const ledger = await readRalplanObstacleLedger(cwd, "run-e", sessionId);
		expect(ledger.obstacles).toHaveLength(1); // stale ITERATE obstacle from stageN=1
		// Approve proceeds (latest pass APPROVE, scoped to stage-02 -> no obstacle there).
		const result = await approveRalplanPlan(cwd, { runId: "run-e", target: "stop", sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("approve");
	});

	it("doctor warns on divergence (APPROVE but a forged obstacle remains)", async () => {
		const critic = await writeRalplanArtifact(
			cwd,
			{ runId: "run-f", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-f", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		await writeRalplanObstacle(
			cwd,
			"run-f",
			sessionId,
			buildRalplanObstacle(
				{
					kind: "plan_rejected",
					name: "forged",
					status: "active",
					scope: { planRef: critic.path },
					originRef: critic.path,
				},
				"now",
			),
		);
		const doctor = await doctorRalplan(cwd, sessionId, "run-f");
		expect(doctor.warnings.some((w) => /divergence/.test(w))).toBe(true);
	});

	it("doctor warns when a blocker verdict has an empty obstacle ledger", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-g", stage: "critic", stageN: 1, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-g", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		await rm(ralplanObstacleLedgerPath(cwd, "run-g", sessionId), { force: true });
		const doctor = await doctorRalplan(cwd, sessionId, "run-g");
		expect(doctor.warnings.some((w) => /REJECT but the obstacle ledger is empty/.test(w))).toBe(true);
	});

	it("doctor does NOT warn on a clean revision loop (ITERATE then APPROVE)", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-h", stage: "critic", stageN: 1, artifact: "## Verdict\nITERATE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-h", stage: "critic", stageN: 2, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-h", stage: "final", stageN: 3, artifact: "# Final" }, sessionId);
		const doctor = await doctorRalplan(cwd, sessionId, "run-h");
		expect(doctor.warnings.some((w) => /divergence|ledger is empty/.test(w))).toBe(false);
	});
});
