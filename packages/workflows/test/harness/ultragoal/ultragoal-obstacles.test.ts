import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalLedger,
	readUltragoalObstacleLedger,
	readUltragoalPlan,
	recordUltragoalObstacle,
	recordUltragoalReviewBlockers,
	startNextUltragoalGoal,
	ULTRAGOAL_OBSTACLE_KINDS,
	ultragoalObstacleLedgerPath,
	unresolvedUltragoalObstacles,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * Phase B-0 tests for the ultragoal typed-obstacle dual-write. These verify the
 * NEW additive path only; the existing review-blocker model is exercised by the
 * team-ultragoal workflow test (one coexistence check here confirms it still works).
 */
describe("ultragoal obstacles — Phase B-0 dual-write", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ultragoal-obstacles-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

	async function seedActiveGoal(): Promise<string> {
		await createUltragoalPlan(cwd, { brief: "Single approved concrete goal with verification criteria." }, sessionId);
		const started = await startNextUltragoalGoal(cwd, false, sessionId);
		return started.goal?.id ?? "G001";
	}

	it("dual-writes: review_blocked goal + steering blocker goal + ledger event + obstacle ledger entry", async () => {
		const goalId = await seedActiveGoal();

		const plan = await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Architect review found defects",
				objective: "Re-work the review-failed criterion then re-run the gate.",
				evidence: "architect review found defects in criterion architectReview.recommendation",
				criterion: "architectReview.recommendation",
				regression: {
					metric: "qualityGate:architectReview.recommendation",
					priorValue: 1,
					newValue: 0,
					direction: "fall",
				},
			},
			sessionId,
		);

		// Legacy half (unchanged): blocked goal + steering blocker goal.
		const blockedGoal = plan.goals.find((goal) => goal.id === goalId);
		expect(blockedGoal?.status).toBe("review_blocked");
		const blockerGoal = plan.goals.find((goal) => goal.steering?.kind === "review_blocker");
		expect(blockerGoal?.steering?.blockedGoalId).toBe(goalId);

		// Legacy ledger event.
		const ledger = await readUltragoalLedger(cwd, sessionId);
		expect(ledger.some((event) => event.event === "review_blockers_recorded" && event.goalId === goalId)).toBe(true);

		// New half: obstacle ledger entry.
		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles).toHaveLength(1);
		const obstacle = obstacleLedger.obstacles[0];
		expect(obstacle.kind).toBe("review_failure");
		expect(obstacle.status).toBe("active");
		expect(obstacle.originSkill).toBe("ultragoal");
		expect(obstacle.originRef).toBe(goalId);
		expect(obstacle.scope?.goalId).toBe(goalId);
		expect(obstacle.scope?.criterion).toBe("architectReview.recommendation");
		expect(obstacle.regression?.metric).toBe("qualityGate:architectReview.recommendation");
	});

	it("integrity wall is atomic: an invalid obstacle writes nothing (no review_blocked, no obstacle, no ledger event)", async () => {
		const goalId = await seedActiveGoal();

		await expect(
			recordUltragoalObstacle(
				cwd,
				{
					goalId,
					kind: "review_failure", // needsRegression:true + criterion kind, but no criterion, no regression
					title: "Bad obstacle",
					objective: "Should not be written",
					evidence: "missing criterion and regression",
				},
				sessionId,
			),
		).rejects.toThrow(/invalid ultragoal obstacle/);

		// Goal is still active (legacy path untouched).
		const plan = await readUltragoalPlan(cwd, sessionId);
		expect(plan?.goals.find((goal) => goal.id === goalId)?.status).toBe("active");
		expect(plan?.goals.some((goal) => goal.steering?.kind === "review_blocker")).toBe(false);

		// No obstacle ledger file was created.
		await expect(access(ultragoalObstacleLedgerPath(cwd, sessionId))).rejects.toThrow();

		// No review_blockers_recorded ledger event.
		const ledger = await readUltragoalLedger(cwd, sessionId);
		expect(ledger.some((event) => event.event === "review_blockers_recorded")).toBe(false);
	});

	it("human_blocked (needsRegression:false) is accepted without a regression", async () => {
		const goalId = await seedActiveGoal();
		await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "human_blocked",
				title: "Human-only blocker",
				objective: "Escalate to a human; no automated resolution.",
				evidence: "requires credentials only a human can provide",
			},
			sessionId,
		);
		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles[0].kind).toBe("human_blocked");
		expect(obstacleLedger.obstacles[0].regression).toBeUndefined();
	});

	it("human_blocked with a regression is rejected by the wall", async () => {
		const goalId = await seedActiveGoal();
		await expect(
			recordUltragoalObstacle(
				cwd,
				{
					goalId,
					kind: "human_blocked",
					title: "Human-only blocker",
					objective: "Escalate.",
					evidence: "requires human",
					regression: { metric: "x", priorValue: 1, newValue: 0, direction: "fall" },
				},
				sessionId,
			),
		).rejects.toThrow(/human_blocked_no_regression/);
	});

	it("review_failure with a regression that did not regress is rejected (no_regression)", async () => {
		const goalId = await seedActiveGoal();
		await expect(
			recordUltragoalObstacle(
				cwd,
				{
					goalId,
					kind: "review_failure",
					title: "Review failure",
					objective: "Re-work.",
					evidence: "criterion did not actually regress",
					criterion: "executorQa.status",
					// direction "fall" but newValue >= priorValue -> not proved
					regression: { metric: "qualityGate:executorQa.status", priorValue: 0, newValue: 1, direction: "fall" },
				},
				sessionId,
			),
		).rejects.toThrow(/no_regression/);
	});

	it("unresolvedUltragoalObstacles returns active/unresolved, excludes resolved, and filters by scope", async () => {
		const goalId = await seedActiveGoal();
		await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Review failure",
				objective: "Re-work.",
				evidence: "criterion regressed",
				criterion: "architectReview.recommendation",
				regression: {
					metric: "qualityGate:architectReview.recommendation",
					priorValue: 1,
					newValue: 0,
					direction: "fall",
				},
			},
			sessionId,
		);
		const ledger = await readUltragoalObstacleLedger(cwd, sessionId);

		expect(unresolvedUltragoalObstacles(ledger, { scope: { goalId } })).toHaveLength(1);
		expect(unresolvedUltragoalObstacles(ledger, { scope: { goalId: "G999" } })).toHaveLength(0);
		expect(
			unresolvedUltragoalObstacles(ledger, { scope: { criterion: "architectReview.recommendation" } }),
		).toHaveLength(1);

		// Mark resolved -> excluded.
		const resolved = { ...ledger.obstacles[0], status: "resolved" as const, resolvedAt: "2026-07-07T00:00:00.000Z" };
		expect(unresolvedUltragoalObstacles({ obstacles: [resolved] })).toHaveLength(0);
	});

	it("rejects an unknown obstacle kind", async () => {
		const goalId = await seedActiveGoal();
		await expect(
			recordUltragoalObstacle(
				cwd,
				{ goalId, kind: "not_a_real_kind", title: "x", objective: "y", evidence: "z" },
				sessionId,
			),
		).rejects.toThrow(/unknown ultragoal obstacle kind/);
	});

	it("coexistence: the existing recordUltragoalReviewBlockers path still works and writes no obstacle ledger", async () => {
		const goalId = await seedActiveGoal();
		const plan = await recordUltragoalReviewBlockers(
			cwd,
			{
				goalId,
				title: "Legacy blocker",
				objective: "Resolve via the legacy path.",
				evidence: "legacy review blockers still work alongside the obstacle ledger",
			},
			sessionId,
		);
		expect(plan.goals.find((goal) => goal.id === goalId)?.status).toBe("review_blocked");
		// The legacy path does NOT write the obstacle ledger.
		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles).toHaveLength(0);
		// And the obstacle ledger file was not created.
		await expect(access(ultragoalObstacleLedgerPath(cwd, sessionId))).rejects.toThrow();
		// Status reflects the blocker.
		const status = await getUltragoalStatus(cwd, sessionId);
		expect(status.counts.review_blocked).toBe(1);
	});

	it("ULTRAGOAL_OBSTACLE_KINDS ships the five design kinds with correct needsRegression flags", () => {
		expect(ULTRAGOAL_OBSTACLE_KINDS.review_failure.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.evidence_missing.needsRegression).toBe(false);
		expect(ULTRAGOAL_OBSTACLE_KINDS.scope_drift.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.contract_contradiction.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.human_blocked.needsRegression).toBe(false);
	});
});
