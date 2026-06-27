import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assert, test } from "vitest";
import { ultragoalLedgerPath } from "../../src/workflows/shared/paths.ts";
import {
	buildCompletionReceipt,
	chooseReceiptKind,
	computeUltragoalPlanGeneration,
	hashStructuredValue,
	latestRelevantLedgerEventId,
	readUltragoalLedger,
	type UltragoalGoal,
	type UltragoalLedgerEvent,
	UltragoalLedgerUnreadable,
	type UltragoalPlan,
	validateCompletionReceipt,
} from "../../src/workflows/ultragoal/ultragoal-receipt.ts";

const sessionId = "test-session-id";

function makeGoal(id: string, objective: string, overrides: Partial<UltragoalGoal> = {}): UltragoalGoal {
	return {
		id,
		title: objective,
		objective,
		status: "pending",
		createdAt: "2026-06-21T00:00:00.000Z",
		updatedAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function makePlan(goals: UltragoalGoal[], mode: UltragoalPlan["goalMode"] = "aggregate"): UltragoalPlan {
	return {
		version: 1,
		brief: "brief",
		goalMode: mode,
		objective: "Complete all approved goals with verification",
		goals,
		createdAt: "2026-06-21T00:00:00.000Z",
		updatedAt: "2026-06-21T00:00:00.000Z",
	};
}

test("hashStructuredValue is deterministic across key insertion order", () => {
	const a = { z: 1, a: { y: 2, b: 3 }, m: [3, 2, 1] };
	const b = { a: { b: 3, y: 2 }, m: [3, 2, 1], z: 1 };
	assert.strictEqual(hashStructuredValue(a), hashStructuredValue(b));
});

test("hashStructuredValue strips undefined values", () => {
	const withUndefined = { a: 1, b: undefined, c: { d: undefined, e: 2 } };
	const withoutUndefined = { a: 1, c: { e: 2 } };
	assert.strictEqual(hashStructuredValue(withUndefined), hashStructuredValue(withoutUndefined));
});

test("chooseReceiptKind: per-story always per-goal; aggregate final-aggregate only on last required complete", () => {
	const g1 = makeGoal("G001", "one", { status: "complete" });
	const g2 = makeGoal("G002", "two", { status: "active" });
	const g3 = makeGoal("G003", "three", { status: "pending" });
	const plan = makePlan([g1, g2, g3], "aggregate");
	assert.strictEqual(chooseReceiptKind(plan, g1, "complete"), "per-goal", "g1 complete while siblings unfinished");
	assert.strictEqual(chooseReceiptKind(plan, g2, "active"), "per-goal", "non-complete always per-goal");
	assert.strictEqual(chooseReceiptKind({ ...plan, goalMode: "per-story" }, g1, "complete"), "per-goal");
	// All other required goals terminal -> final-aggregate.
	const allButLast = makePlan([
		makeGoal("G001", "one", { status: "complete" }),
		makeGoal("G002", "two", { status: "superseded" }),
		makeGoal("G003", "three", { status: "pending" }),
	]);
	assert.strictEqual(
		chooseReceiptKind(allButLast, allButLast.goals[2], "complete"),
		"final-aggregate",
		"last required goal completes aggregate",
	);
});

test("latestRelevantLedgerEventId excludes excludeEventId and ignores blank ids", () => {
	const ledger: UltragoalLedgerEvent[] = [
		{ eventId: "e1", event: "plan_created" },
		{ eventId: "e2", event: "goal_started", goalId: "G001" },
		{ eventId: "e3", event: "goal_checkpointed", goalId: "G001", status: "complete" },
	];
	assert.strictEqual(latestRelevantLedgerEventId(ledger, ["G001"]), "e3");
	assert.strictEqual(latestRelevantLedgerEventId(ledger, ["G001"], "e3"), "e2");
	// plan_created (no goalId) counts as relevant to every goal.
	assert.strictEqual(latestRelevantLedgerEventId(ledger, ["G999"]), "e1");
});

test("buildCompletionReceipt then validateCompletionReceipt is verified (self-stale excluded)", () => {
	const g1 = makeGoal("G001", "one", { status: "active" });
	const g2 = makeGoal("G002", "two", { status: "pending" });
	const plan = makePlan([g1, g2]);
	const ledger: UltragoalLedgerEvent[] = [{ eventId: "e0", event: "plan_created" }];
	const now = "2026-06-21T12:00:00.000Z";
	const qualityGateJson = { executorQa: { artifactRefs: [] }, contractCoverage: [] };
	const goalJson = { ...g1, status: "active", updatedAt: now };
	const checkpointLedgerEventId = "evt-checkpoint-1";
	const receipt = buildCompletionReceipt({
		plan,
		ledger,
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
		qualityGateJson,
		goalJson,
		now,
		checkpointLedgerEventId,
	});
	assert.strictEqual(receipt.receiptKind, "per-goal");
	assert.strictEqual(receipt.goalSnapshotHash, hashStructuredValue(goalJson));
	assert.strictEqual(receipt.qualityGateHash, hashStructuredValue(qualityGateJson));
	// After checkpoint, the goal's status/updatedAt match the snapshot and the
	// checkpoint event is in the ledger carrying the additive qualityGateJson/goalJson.
	const completedGoal: UltragoalGoal = {
		...g1,
		status: "complete",
		updatedAt: now,
		completedAt: now,
		evidence: "evidence",
		completionVerification: receipt,
	};
	const ledgerWithCheckpoint: UltragoalLedgerEvent[] = [
		...ledger,
		{
			eventId: checkpointLedgerEventId,
			event: "goal_checkpointed",
			goalId: g1.id,
			status: "complete",
			statusBefore: "active",
			completionVerification: receipt,
			qualityGateJson,
			goalJson,
		},
	];
	const diag = validateCompletionReceipt({
		plan: { ...plan, goals: [completedGoal, g2] },
		ledger: ledgerWithCheckpoint,
		goal: completedGoal,
		receiptKind: "per-goal",
	});
	assert.strictEqual(diag.state, "active_verified_complete", diag.message);
});

test("validateCompletionReceipt flags missing receipt and final-aggregate missing", () => {
	const g1 = makeGoal("G001", "one", { status: "complete" });
	const plan = makePlan([g1]);
	assert.strictEqual(
		validateCompletionReceipt({ plan, ledger: [], goal: g1, receiptKind: "per-goal" }).state,
		"active_missing_receipt",
	);
	assert.strictEqual(
		validateCompletionReceipt({ plan, ledger: [], goal: g1, receiptKind: "final-aggregate" }).state,
		"active_missing_final_receipt",
	);
});

test("validateCompletionReceipt flags dirty quality gate", () => {
	const g1 = makeGoal("G001", "one", { status: "active" });
	const plan = makePlan([g1]);
	const now = "2026-06-21T12:00:00.000Z";
	const qualityGateJson = { executorQa: { artifactRefs: [] }, contractCoverage: [] };
	const goalJson = { ...g1, status: "active", updatedAt: now };
	const checkpointLedgerEventId = "evt-1";
	const receipt = buildCompletionReceipt({
		plan,
		ledger: [],
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
		qualityGateJson,
		goalJson,
		now,
		checkpointLedgerEventId,
	});
	const completedGoal: UltragoalGoal = {
		...g1,
		status: "complete",
		updatedAt: now,
		completedAt: now,
		completionVerification: receipt,
	};
	const ledger: UltragoalLedgerEvent[] = [
		{
			eventId: checkpointLedgerEventId,
			event: "goal_checkpointed",
			goalId: g1.id,
			status: "complete",
			completionVerification: receipt,
			qualityGateJson: { ...qualityGateJson, mutated: true },
			goalJson,
		},
	];
	assert.strictEqual(
		validateCompletionReceipt({
			plan: { ...plan, goals: [completedGoal] },
			ledger,
			goal: completedGoal,
			receiptKind: "per-goal",
		}).state,
		"active_dirty_quality_gate",
	);
});

test("validateCompletionReceipt flags stale when goal.updatedAt drifts from verifiedAt", () => {
	const g1 = makeGoal("G001", "one", { status: "active" });
	const plan = makePlan([g1]);
	const now = "2026-06-21T12:00:00.000Z";
	const qualityGateJson = { executorQa: {} };
	const goalJson = { ...g1, status: "active", updatedAt: now };
	const checkpointLedgerEventId = "evt-1";
	const receipt = buildCompletionReceipt({
		plan,
		ledger: [],
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
		qualityGateJson,
		goalJson,
		now,
		checkpointLedgerEventId,
	});
	const driftedGoal: UltragoalGoal = {
		...g1,
		status: "complete",
		updatedAt: "2026-06-21T13:00:00.000Z",
		completedAt: "2026-06-21T13:00:00.000Z",
		completionVerification: receipt,
	};
	const ledger: UltragoalLedgerEvent[] = [
		{
			eventId: checkpointLedgerEventId,
			event: "goal_checkpointed",
			goalId: g1.id,
			status: "complete",
			completionVerification: receipt,
			qualityGateJson,
			goalJson,
		},
	];
	assert.strictEqual(
		validateCompletionReceipt({
			plan: { ...plan, goals: [driftedGoal] },
			ledger,
			goal: driftedGoal,
			receiptKind: "per-goal",
		}).state,
		"active_stale_receipt",
	);
});

test("sibling completion does not stale a sibling per-goal receipt (snapshot exclusion)", () => {
	const g1 = makeGoal("G001", "one", { status: "active" });
	const g2 = makeGoal("G002", "two", { status: "active" });
	const plan = makePlan([g1, g2]);
	const now1 = "2026-06-21T12:00:00.000Z";
	const qualityGateJson = { executorQa: {} };
	const goalJson1 = { ...g1, status: "active", updatedAt: now1 };
	const checkpointLedgerEventId1 = "evt-1";
	const receipt1 = buildCompletionReceipt({
		plan,
		ledger: [],
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
		qualityGateJson,
		goalJson: goalJson1,
		now: now1,
		checkpointLedgerEventId: checkpointLedgerEventId1,
	});
	const g1Complete: UltragoalGoal = {
		...g1,
		status: "complete",
		updatedAt: now1,
		completedAt: now1,
		completionVerification: receipt1,
	};
	// Now g2 completes, appending a new event and bumping plan.updatedAt.
	const now2 = "2026-06-21T13:00:00.000Z";
	const goalJson2 = { ...g2, status: "active", updatedAt: now2 };
	const checkpointLedgerEventId2 = "evt-2";
	const receipt2 = buildCompletionReceipt({
		plan: { ...plan, goals: [g1Complete, g2] },
		ledger: [
			{
				eventId: checkpointLedgerEventId1,
				event: "goal_checkpointed",
				goalId: g1.id,
				status: "complete",
				completionVerification: receipt1,
				qualityGateJson,
				goalJson: goalJson1,
			},
		],
		goal: g2,
		receiptKind: "per-goal",
		beforeStatus: "active",
		qualityGateJson,
		goalJson: goalJson2,
		now: now2,
		checkpointLedgerEventId: checkpointLedgerEventId2,
	});
	const g2Complete: UltragoalGoal = {
		...g2,
		status: "complete",
		updatedAt: now2,
		completedAt: now2,
		completionVerification: receipt2,
	};
	const ledger: UltragoalLedgerEvent[] = [
		{
			eventId: checkpointLedgerEventId1,
			event: "goal_checkpointed",
			goalId: g1.id,
			status: "complete",
			completionVerification: receipt1,
			qualityGateJson,
			goalJson: goalJson1,
		},
		{
			eventId: checkpointLedgerEventId2,
			event: "goal_checkpointed",
			goalId: g2.id,
			status: "complete",
			completionVerification: receipt2,
			qualityGateJson,
			goalJson: goalJson2,
		},
	];
	const finalPlan = { ...plan, goals: [g1Complete, g2Complete], updatedAt: now2 };
	// g1's receipt must remain verified despite g2's completion and plan.updatedAt bump.
	assert.strictEqual(
		validateCompletionReceipt({ plan: finalPlan, ledger, goal: g1Complete, receiptKind: "per-goal" }).state,
		"active_verified_complete",
	);
});

test("readUltragoalLedger: missing file => empty; corrupt line => UltragoalLedgerUnreadable", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-ug-receipt-"));
	try {
		// Missing file => empty.
		assert.deepEqual(await readUltragoalLedger(dir, sessionId), []);
		await mkdir(join(dir, ".pi", "ultragoal"), { recursive: true });
		const path = ultragoalLedgerPath(dir, sessionId);
		// Corrupt JSONL => typed error.
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify({ eventId: "ok" })}\n{not valid json\n`);
		let threw: unknown;
		try {
			await readUltragoalLedger(dir, sessionId);
		} catch (error) {
			threw = error;
		}
		assert.ok(threw instanceof UltragoalLedgerUnreadable, `expected UltragoalLedgerUnreadable, got ${String(threw)}`);
		// Valid => parsed.
		await writeFile(path, `${JSON.stringify({ eventId: "e1", event: "plan_created" })}\n\n`);
		const events = await readUltragoalLedger(dir, sessionId);
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].eventId, "e1");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("computeUltragoalPlanGeneration excludes the receipt's own checkpoint event", () => {
	const g1 = makeGoal("G001", "one", { status: "active" });
	const plan = makePlan([g1]);
	const ownEventId = "evt-self";
	const ledger: UltragoalLedgerEvent[] = [
		{ eventId: "e-prev", event: "goal_started", goalId: g1.id },
		{ eventId: ownEventId, event: "goal_checkpointed", goalId: g1.id, status: "complete" },
	];
	const withSelf = computeUltragoalPlanGeneration({
		plan,
		ledger,
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
	}).basis.latestRelevantLedgerEventIdBeforeCheckpoint;
	const withoutSelf = computeUltragoalPlanGeneration({
		plan,
		ledger,
		goal: g1,
		receiptKind: "per-goal",
		beforeStatus: "active",
		excludeEventId: ownEventId,
	}).basis.latestRelevantLedgerEventIdBeforeCheckpoint;
	assert.strictEqual(withSelf, ownEventId, "without exclude the own event is latest");
	assert.strictEqual(withoutSelf, "e-prev", "excludeEventId drops the own event");
});
