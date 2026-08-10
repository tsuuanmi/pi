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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * `approveRalplanPlan` always asserts obstacle-ledger agreement against the
 * latest critic pass (scoped by planRef so stale obstacles from earlier
 * revision passes are ignored). Divergence throws in every environment; there
 * is no production warn path. Approval always requires an APPROVE verdict.
 */
describe("ralplan obstacle agreement (strict)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-agreement-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("approve throws when the ledger disagrees with an APPROVE verdict (forged obstacle)", async () => {
		const critic = await writeRalplanArtifact(
			cwd,
			{ runId: "run-a", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
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
		await expect(
			approveRalplanPlan(cwd, { runId: "run-a", target: "stop", approved: true, sessionId }),
		).rejects.toThrow(/divergence/);
	});

	it("approve agrees on a clean APPROVE (no divergence)", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-b", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-b", stage: "final", stageN: 2, artifact: "# Final" }, sessionId);
		const result = await approveRalplanPlan(cwd, { runId: "run-b", target: "stop", approved: true, sessionId });
		expect(result.approved).toBe(true);
		expect(result.critic_verdict).toBe("approve");
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
		expect(ledger.obstacles).toHaveLength(1);
		const result = await approveRalplanPlan(cwd, { runId: "run-e", target: "stop", approved: true, sessionId });
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
