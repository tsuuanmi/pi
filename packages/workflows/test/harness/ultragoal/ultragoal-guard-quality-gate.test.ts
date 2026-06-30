import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, expect, test } from "vitest";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	recordUltragoalBlockerClassification,
	recordUltragoalReviewBlockers,
	startNextUltragoalGoal,
	ultragoalGoalsPath,
	ultragoalGuard,
	ultragoalLedgerPath,
	validateCompletionQualityGate,
} from "@tsuuanmi/pi-workflows";

const sessionId = "test-session-id";
const PASSED = "passed";

async function withDir<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await mkdtemp(join(tmpdir(), "pi-ug-qg-"));
	try {
		return await fn(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

function fullQualityGate(): Record<string, unknown> {
	return {
		architectReview: {
			architectureStatus: "CLEAR",
			productStatus: "CLEAR",
			codeStatus: "CLEAR",
			recommendation: "APPROVE",
			commands: ["architect review"],
			evidence: "Architect reviewed architecture, product, and code lanes with no blockers.",
			blockers: [],
		},
		executorQa: {
			status: PASSED,
			e2eStatus: PASSED,
			redTeamStatus: PASSED,
			evidence: "Executor QA covered contracts, surfaces, and adversarial cases with durable proof.",
			e2eCommands: ["npm run check"],
			redTeamCommands: ["node -e console.log"],
			artifactRefs: [
				{
					id: "api-report",
					kind: "api-package-test-report",
					description: "API/package behavior report",
					verifiedReceipt: { verifiedAt: "2026-06-28T00:00:00.000Z", summary: "verified" },
				},
				{
					id: "adversarial-report",
					kind: "failure-mode-test-report",
					description: "Adversarial behavior report",
					verifiedReceipt: { verifiedAt: "2026-06-28T00:00:00.000Z", summary: "verified" },
				},
			],
			surfaceEvidence: [
				{
					id: "surface-api",
					surface: "api/package",
					contractRef: "contract#a",
					invocation: "package consumer test",
					result: PASSED,
					artifactRefs: ["api-report"],
				},
			],
			adversarialCases: [
				{
					id: "case-invalid",
					contractRef: "contract#a",
					scenario: "invalid input",
					expectedBehavior: "reject cleanly",
					result: PASSED,
					artifactRefs: ["adversarial-report"],
				},
			],
			contractCoverage: [
				{
					id: "coverage-a",
					contractRef: "contract#a",
					obligation: "contract is covered",
					status: PASSED,
					surfaceEvidenceRefs: ["surface-api"],
					adversarialCaseRefs: ["case-invalid"],
				},
			],
			blockers: [],
		},
		iteration: {
			status: PASSED,
			fullRerun: true,
			rerunCommands: ["npm run check"],
			evidence: "Full verification reran after blocker resolution.",
			blockers: [],
		},
	};
}

async function readIfExists(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return "";
	}
}

test("quality gate rejects unsupported top-level keys", async () => {
	await withDir(async (cwd) => {
		await expect(validateCompletionQualityGate(cwd, { status: "passed", ...fullQualityGate() })).rejects.toThrow(
			/unsupported keys: status/,
		);
	});
});

test("quality gate accepts the full architectReview/executorQa/iteration shape", async () => {
	await withDir(async (cwd) => {
		await validateCompletionQualityGate(cwd, fullQualityGate());
	});
});

test("quality gate rejects failed statuses, non-empty blockers, and GJC CLI replay", async () => {
	await withDir(async (cwd) => {
		await expect(
			validateCompletionQualityGate(cwd, {
				...fullQualityGate(),
				architectReview: { ...(fullQualityGate().architectReview as Record<string, unknown>), blockers: ["nope"] },
			}),
		).rejects.toThrow(/architectReview.blockers/);
		await expect(
			validateCompletionQualityGate(cwd, {
				...fullQualityGate(),
				executorQa: { ...(fullQualityGate().executorQa as Record<string, unknown>), status: "failed" },
			}),
		).rejects.toThrow(/executorQa status/);
		await expect(
			validateCompletionQualityGate(cwd, {
				...fullQualityGate(),
				iteration: { ...(fullQualityGate().iteration as Record<string, unknown>), fullRerun: false },
			}),
		).rejects.toThrow(/fullRerun true/);

		const gate = fullQualityGate();
		const executorQa = gate.executorQa as Record<string, unknown>;
		executorQa.artifactRefs = [
			{
				id: "gjc-cli",
				kind: "cli-replay",
				description: "GJC-specific replay must not be accepted in Pi",
				inlineEvidence: {
					schemaVersion: 1,
					kind: "cli-replay",
					replaySafe: true,
					command: ["gjc", "status"],
					recordedStdout: "",
				},
			},
		];
		executorQa.surfaceEvidence = [
			{
				id: "surface-cli",
				surface: "cli",
				contractRef: "contract#a",
				invocation: "gjc status",
				result: PASSED,
				artifactRefs: ["gjc-cli"],
			},
		];
		executorQa.adversarialCases = [
			{
				id: "case-invalid",
				contractRef: "contract#a",
				scenario: "invalid input",
				expectedBehavior: "reject cleanly",
				result: PASSED,
				artifactRefs: ["gjc-cli"],
			},
		];
		executorQa.contractCoverage = [
			{
				id: "coverage-a",
				contractRef: "contract#a",
				obligation: "contract is covered",
				status: PASSED,
				surfaceEvidenceRefs: ["surface-cli"],
				adversarialCaseRefs: ["case-invalid"],
			},
		];
		await expect(validateCompletionQualityGate(cwd, gate)).rejects.toThrow(/allowlist/);
	});
});

test("checkpoint complete writes a schema-v2 receipt and guard verifies it", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const goal = await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the runtime-owned state with focused automated checks.",
				qualityGate: fullQualityGate(),
			},
			sessionId,
		);
		assert.strictEqual(goal.completionVerification?.schemaVersion, 2);
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "active_verified_complete", diag.message);
	});
});

test("invalid complete checkpoint rejects before mutating goals or ledger", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const goalsBefore = await readIfExists(ultragoalGoalsPath(cwd, sessionId));
		const ledgerBefore = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(
			checkpointUltragoalGoal(
				cwd,
				{
					goalId: "G001",
					status: "complete",
					evidence: "Implemented and verified the runtime-owned state with focused automated checks.",
					qualityGate: {
						...fullQualityGate(),
						executorQa: { ...(fullQualityGate().executorQa as Record<string, unknown>), status: "failed" },
					},
				},
				sessionId,
			),
		).rejects.toThrow(/executorQa status/);
		assert.strictEqual(await readIfExists(ultragoalGoalsPath(cwd, sessionId)), goalsBefore);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerBefore);
	});
});

test("old schema completion receipts cannot prove completion", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Implemented and verified the runtime-owned state with focused automated checks.",
				qualityGate: fullQualityGate(),
			},
			sessionId,
		);
		const goalsPath = ultragoalGoalsPath(cwd, sessionId);
		const goalsJson = JSON.parse(await readFile(goalsPath, "utf8"));
		goalsJson.goals[0].completionVerification.schemaVersion = 1;
		await writeFile(goalsPath, JSON.stringify(goalsJson, null, 2));
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "active_stale_receipt", diag.message);
	});
});

test("record-review-blockers creates blocker goal and guard reports recorded blocker", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const plan = await recordUltragoalReviewBlockers(
			cwd,
			{
				goalId: "G001",
				title: "Resolve review blockers",
				objective: "Fix the review blockers and rerun verification.",
				evidence: "Architect review found blocking verification issues.",
			},
			sessionId,
		);
		assert.strictEqual(plan.goals[0]?.status, "review_blocked");
		assert.strictEqual(plan.goals[1]?.steering?.kind, "review_blocker");
		assert.strictEqual(plan.goals[1]?.steering?.blockedGoalId, "G001");
		const diag = await ultragoalGuard(cwd, sessionId, { goalId: "G001" });
		assert.strictEqual(diag.state, "active_review_blocked_recorded", diag.message);
	});
});

test("record-review-blockers rejects invalid and duplicate targets before mutation", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const goalsBefore = await readIfExists(ultragoalGoalsPath(cwd, sessionId));
		const ledgerBefore = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(
			recordUltragoalReviewBlockers(
				cwd,
				{ goalId: "G999", title: "Fix", objective: "Fix it", evidence: "review evidence" },
				sessionId,
			),
		).rejects.toThrow(/unknown ultragoal goal/);
		assert.strictEqual(await readIfExists(ultragoalGoalsPath(cwd, sessionId)), goalsBefore);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerBefore);

		await recordUltragoalReviewBlockers(
			cwd,
			{
				goalId: "G001",
				title: "Resolve review blockers",
				objective: "Fix the review blockers and rerun verification.",
				evidence: "Architect review found blocking verification issues.",
			},
			sessionId,
		);
		const goalsAfterRecord = await readIfExists(ultragoalGoalsPath(cwd, sessionId));
		const ledgerAfterRecord = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(
			recordUltragoalReviewBlockers(
				cwd,
				{
					goalId: "G001",
					title: "Duplicate",
					objective: "Duplicate blocker.",
					evidence: "Duplicate review evidence.",
				},
				sessionId,
			),
		).rejects.toThrow(/active goal|already recorded/);
		assert.strictEqual(await readIfExists(ultragoalGoalsPath(cwd, sessionId)), goalsAfterRecord);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerAfterRecord);
	});
});

test("failed/blocked checkpoints require immediate latest matching human_blocked classification and are non-mutating on reject", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const goalsBefore = await readIfExists(ultragoalGoalsPath(cwd, sessionId));
		const ledgerBefore = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId)).rejects.toThrow(
			/human_blocked/,
		);
		assert.strictEqual(await readIfExists(ultragoalGoalsPath(cwd, sessionId)), goalsBefore);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerBefore);

		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "resolvable", evidence: "Can be fixed by the agent.", goalId: "G001" },
			sessionId,
		);
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId)).rejects.toThrow(
			/human_blocked/,
		);

		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "human_blocked", evidence: "Requires a human credential approval.", goalId: "G001" },
			sessionId,
		);
		await checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId);
	});
});

test("blocker classification rejects invalid inputs before appending ledger rows", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const ledgerBefore = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(
			recordUltragoalBlockerClassification(
				cwd,
				{ classification: "human_blocked", evidence: " ", goalId: "G001" },
				sessionId,
			),
		).rejects.toThrow(/evidence is required/);
		await expect(
			recordUltragoalBlockerClassification(
				cwd,
				{ classification: "invalid" as "human_blocked", evidence: "Bad classification.", goalId: "G001" },
				sessionId,
			),
		).rejects.toThrow(/classification/);
		await expect(
			recordUltragoalBlockerClassification(
				cwd,
				{ classification: "human_blocked", evidence: "Unknown target.", goalId: "G999" },
				sessionId,
			),
		).rejects.toThrow(/unknown ultragoal goal/);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerBefore);
	});
});

test("failed/blocked authorization rejects mismatched and goal-less non-current classifications", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A.\n@goal B\nDo B." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "human_blocked", evidence: "Wrong goal is blocked.", goalId: "G002" },
			sessionId,
		);
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId)).rejects.toThrow(
			/does not match/,
		);

		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "human_blocked", evidence: "Current active goal is blocked." },
			sessionId,
		);
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G002", status: "blocked" }, sessionId)).rejects.toThrow(
			/target goal to be active|current active goal/,
		);
		await checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId);
	});
});

test("intervening ledger event stales a human_blocked classification", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "human_blocked", evidence: "Requires a human credential approval.", goalId: "G001" },
			sessionId,
		);
		await checkpointUltragoalGoal(cwd, { goalId: "G001", status: "active" }, sessionId);
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId)).rejects.toThrow(
			/human_blocked/,
		);
	});
});

test("failed/blocked checkpoints reject non-active targets before mutation", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G001",
				status: "complete",
				evidence: "Completed the active target with enough substantive verification evidence.",
				qualityGate: fullQualityGate(),
			},
			sessionId,
		);
		await recordUltragoalBlockerClassification(
			cwd,
			{ classification: "human_blocked", evidence: "Requires a human credential approval.", goalId: "G001" },
			sessionId,
		);
		const goalsBefore = await readIfExists(ultragoalGoalsPath(cwd, sessionId));
		const ledgerBefore = await readIfExists(ultragoalLedgerPath(cwd, sessionId));
		await expect(checkpointUltragoalGoal(cwd, { goalId: "G001", status: "blocked" }, sessionId)).rejects.toThrow(
			/target goal to be active/,
		);
		assert.strictEqual(await readIfExists(ultragoalGoalsPath(cwd, sessionId)), goalsBefore);
		assert.strictEqual(await readIfExists(ultragoalLedgerPath(cwd, sessionId)), ledgerBefore);
	});
});

test("completing a blocker-resolution goal supersedes original review_blocked goal and can create final aggregate receipt", async () => {
	await withDir(async (cwd) => {
		await createUltragoalPlan(cwd, { brief: "@goal A\nDo A." }, sessionId);
		await startNextUltragoalGoal(cwd, false, sessionId);
		await recordUltragoalReviewBlockers(
			cwd,
			{
				goalId: "G001",
				title: "Resolve review blockers",
				objective: "Fix blockers.",
				evidence: "Verification found blockers.",
			},
			sessionId,
		);
		await startNextUltragoalGoal(cwd, false, sessionId);
		const blocker = await checkpointUltragoalGoal(
			cwd,
			{
				goalId: "G002",
				status: "complete",
				evidence: "Resolved the blocker story and reran focused verification successfully.",
				qualityGate: fullQualityGate(),
			},
			sessionId,
		);
		assert.strictEqual(blocker.completionVerification?.receiptKind, "final-aggregate");
		const goalsJson = JSON.parse(await readFile(ultragoalGoalsPath(cwd, sessionId), "utf8"));
		assert.strictEqual(goalsJson.goals[0].status, "superseded");
		const diag = await ultragoalGuard(cwd, sessionId);
		assert.strictEqual(diag.state, "active_verified_complete", diag.message);
	});
});

test("plain briefs remain one goal and column-zero @goal delimiters split goals", async () => {
	await withDir(async (cwd) => {
		const plain = await createUltragoalPlan(cwd, { brief: "Do a plain single-goal task." }, `${sessionId}-plain`);
		assert.strictEqual(plain.goals.length, 1);
		const delimited = await createUltragoalPlan(
			cwd,
			{ brief: "@goal A\nDo A.\n  @goal not a delimiter\n@goal B\nDo B." },
			`${sessionId}-delimited`,
		);
		assert.strictEqual(delimited.goals.length, 2);
		assert.match(delimited.goals[0]?.objective ?? "", /@goal not a delimiter/);
	});
});

test("no deferred Tier 2 tool names are registered or advertised in Ultragoal docs", async () => {
	const toolsSource = await readFile(
		join(
			import.meta.dirname,
			"..",
			"..",
			"src",
			"runtime",
			"ultragoal",
			"ultragoal-tools.ts",
		),
		"utf8",
	);
	const skillDoc = await readFile(
		join(import.meta.dirname, "..", "..", "src", "skills", "ultragoal", "SKILL.md"),
		"utf8",
	);
	for (const source of [toolsSource, skillDoc]) {
		assert.ok(!source.includes('name: "ultragoal_review"'));
		assert.ok(!source.includes('name: "ultragoal_steer"'));
		assert.ok(!source.includes("ultragoal_review"));
		assert.ok(!source.includes("ultragoal_steer"));
	}
});
