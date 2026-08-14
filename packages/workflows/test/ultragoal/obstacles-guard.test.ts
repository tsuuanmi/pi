import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createUltragoalPlan,
	readUltragoalObstacleLedger,
	readUltragoalPlan,
	readUltragoalVerificationState,
	recordUltragoalObstacle,
	startNextUltragoalGoal,
	ultragoalObstacleLedgerPath,
	writeJsonAtomic,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ultragoalGoalsPath } from "#workflows/skills/ultragoal/paths";

const sessionId = "test-session-id";

describe("ultragoal typed obstacle guard", () => {
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

	async function recordReviewFailure(goalId: string): Promise<void> {
		await recordUltragoalObstacle(
			cwd,
			{
				goalId,
				kind: "review_failure",
				title: "Architect review found defects",
				objective: "Repair the criterion and rerun verification.",
				evidence: "Architect review found defects.",
				rationale: "The review recommendation regressed and blocks completion.",
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
	}

	it("accepts only matching unresolved obstacle and active blocker-goal state", async () => {
		const goalId = await seedActiveGoal();
		await recordReviewFailure(goalId);

		const obstacleLedger = await readUltragoalObstacleLedger(cwd, sessionId);
		expect(obstacleLedger.obstacles).toHaveLength(1);
		const diagnostic = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diagnostic.state).toBe("active_review_blocked_recorded");
	});

	it("rejects graph-only blocker state when the typed obstacle is missing", async () => {
		const goalId = await seedActiveGoal();
		await recordReviewFailure(goalId);
		await writeJsonAtomic(ultragoalObstacleLedgerPath(cwd, sessionId), { obstacles: [] }, { cwd });

		const diagnostic = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diagnostic.state).toBe("active_review_blocked_unrecorded");
	});

	it("rejects obstacle-only state when the blocker goal is no longer active", async () => {
		const goalId = await seedActiveGoal();
		await recordReviewFailure(goalId);
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

		const diagnostic = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diagnostic.state).toBe("active_review_blocked_unrecorded");
	});

	it("fails closed when the typed obstacle ledger is malformed", async () => {
		const goalId = await seedActiveGoal();
		await writeFile(ultragoalObstacleLedgerPath(cwd, sessionId), "{", "utf8");
		const diagnostic = await readUltragoalVerificationState(cwd, sessionId, { goalId });
		expect(diagnostic.state).toBe("unreadable_fail_closed");
		expect(diagnostic.message).toContain("malformed JSON");
	});
});
