import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createUltragoalPlan,
	readUltragoalObstacleLedger,
	readUltragoalVerificationState,
	recordUltragoalObstacle,
	recordUltragoalReviewBlockers,
	startNextUltragoalGoal,
	ultragoalGoalsPath,
	writeJsonAtomic,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * Phase B-1: the guard reads the obstacle ledger alongside the graph-walk and
 * asserts they agree ONLY when the obstacle ledger has spoken. The diagnostic
 * state stays graph-walk-driven (unchanged); a divergence is a dev-only throw.
 */
describe("ultragoal guard — Phase B-1 obstacle/graph-walk agreement", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ultragoal-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

	it("B-0 dual-write path: graph-walk recorded + obstacle present agree -> recorded state, no throw", async () => {
		const goalId = await seedActiveGoal();
		await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Architect review found defects",
				objective: "Re-work the criterion then re-run the gate.",
				evidence: "architect review found defects",
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

		// Obstacle ledger has spoken.
		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles).toHaveLength(1);

		// Guard agrees: recorded state, no divergence throw.
		const diag = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diag.state).toBe("active_review_blocked_recorded");
	});

	it("legacy recordUltragoalReviewBlockers path: empty obstacle ledger -> graph-walk authoritative -> recorded state, no throw", async () => {
		const goalId = await seedActiveGoal();
		await recordUltragoalReviewBlockers(
			cwd,
			{
				goalId,
				title: "Legacy blocker",
				objective: "Resolve via the legacy path.",
				evidence: "legacy review blockers still work",
			},
			sessionId,
		);

		// Legacy path writes no obstacle.
		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles).toHaveLength(0);

		// Guard still returns the recorded state (graph-walk authoritative, no
		// divergence check because the obstacle ledger is empty).
		const diag = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diag.state).toBe("active_review_blocked_recorded");
	});

	it("divergence: obstacle present but graph-walk not recorded -> dev-only throw", async () => {
		const goalId = await seedActiveGoal();
		await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Architect review found defects",
				objective: "Re-work the criterion then re-run the gate.",
				evidence: "architect review found defects",
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

		// Forge an inconsistent state: complete the blocker-resolution goal (so the
		// graph-walk no longer sees a recorded blocker) while the blocked goal stays
		// review_blocked and the obstacle ledger still has the active obstacle.
		const { readUltragoalPlan } = await import("@tsuuanmi/pi-workflows");
		const plan = await readUltragoalPlan(cwd, sessionId);
		if (!plan) throw new Error("plan missing");
		const tampered = {
			...plan,
			goals: plan.goals.map((goal) =>
				goal.steering?.kind === "review_blocker" ? { ...goal, status: "complete" as const } : goal,
			),
		};
		await writeJsonAtomic(ultragoalGoalsPath(cwd, sessionId), tampered as unknown as Record<string, unknown>, {
			cwd,
		});

		// Graph-walk now says "not recorded"; obstacle ledger says "blocked" -> divergence.
		await expect(readUltragoalVerificationState(cwd, sessionId, { goalId })).rejects.toThrow(
			/obstacle\/graph-walk divergence/,
		);
	});
});
