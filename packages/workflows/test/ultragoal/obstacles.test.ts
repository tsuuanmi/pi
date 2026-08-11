import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createUltragoalPlan,
	readUltragoalLedger,
	readUltragoalObstacleLedger,
	readUltragoalPlan,
	recordUltragoalObstacle,
	startNextUltragoalGoal,
	ULTRAGOAL_OBSTACLE_KINDS,
	ultragoalObstacleLedgerPath,
	unresolvedUltragoalObstacles,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

describe("ultragoal obstacle transition", () => {
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

	it("records one typed obstacle and projects one blocker goal", async () => {
		const goalId = await seedActiveGoal();

		const plan = await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Architect review found defects",
				objective: "Re-work the review-failed criterion then re-run the gate.",
				evidence: "architect review found defects in criterion architectReview.recommendation",
				rationale: "The review criterion regressed and must be repaired.",
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

		// Goal-graph projection.
		const blockedGoal = plan.goals.find((goal) => goal.id === goalId);
		expect(blockedGoal?.status).toBe("review_blocked");
		const blockerGoal = plan.goals.find((goal) => goal.steering?.kind === "review_blocker");
		expect(blockerGoal?.steering?.blockedGoalId).toBe(goalId);

		// Canonical transition receipt.
		const ledger = await readUltragoalLedger(cwd, sessionId);
		expect(ledger.some((event) => event.event === "obstacle_recorded" && event.goalId === goalId)).toBe(true);

		// Typed obstacle record.
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
					rationale: "Invalid fixture must fail before writes.",
				},
				sessionId,
			),
		).rejects.toThrow(/invalid ultragoal obstacle/);

		// Goal is still active.
		const plan = await readUltragoalPlan(cwd, sessionId);
		expect(plan?.goals.find((goal) => goal.id === goalId)?.status).toBe("active");
		expect(plan?.goals.some((goal) => goal.steering?.kind === "review_blocker")).toBe(false);

		// No obstacle ledger file was created.
		await expect(access(ultragoalObstacleLedgerPath(cwd, sessionId))).rejects.toThrow();

		// No obstacle transition receipt.
		const ledger = await readUltragoalLedger(cwd, sessionId);
		expect(ledger.some((event) => event.event === "obstacle_recorded")).toBe(false);
	});

	it("rejects human-only blockers from the resolvable obstacle transition", async () => {
		const goalId = await seedActiveGoal();
		await expect(
			recordUltragoalObstacle(
				cwd,
				{
					goalId,
					kind: "human_blocked" as never,
					title: "Human-only blocker",
					objective: "Escalate to a human.",
					evidence: "requires human credentials",
					rationale: "Only a human can provide the credential.",
				},
				sessionId,
			),
		).rejects.toThrow(/use classify-blocker/);
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
					rationale: "The claimed regression is inconsistent with its metrics.",
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
				rationale: "The criterion regressed and blocks completion.",
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
				{
					goalId,
					kind: "not_a_real_kind" as never,
					title: "x",
					objective: "y",
					evidence: "z",
					rationale: "invalid",
				},
				sessionId,
			),
		).rejects.toThrow(/unknown ultragoal obstacle kind/);
	});

	it("rejects malformed obstacle ledger state instead of treating it as empty", async () => {
		await seedActiveGoal();
		await writeFile(ultragoalObstacleLedgerPath(cwd, sessionId), "{", "utf8");
		await expect(readUltragoalObstacleLedger(cwd, sessionId)).rejects.toThrow(/malformed JSON/);
	});

	it("ULTRAGOAL_OBSTACLE_KINDS ships the five design kinds with correct needsRegression flags", () => {
		expect(ULTRAGOAL_OBSTACLE_KINDS.review_failure.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.evidence_missing.needsRegression).toBe(false);
		expect(ULTRAGOAL_OBSTACLE_KINDS.scope_drift.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.contract_contradiction.needsRegression).toBe(true);
		expect(ULTRAGOAL_OBSTACLE_KINDS.human_blocked.needsRegression).toBe(false);
	});
});
