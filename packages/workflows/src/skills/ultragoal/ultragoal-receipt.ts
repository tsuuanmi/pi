/**
 * Ultragoal completion-receipt model and stale-detection (UG-001/002/005/006/008).
 *
 * Ports Gajae's actual receipt/basis model to Pi-native field names and paths.
 * This module is the foundation of the safety-enforced execution ledger: it owns
 * receipt kinds, the Gajae-faithful completion-verification shape, plan-generation
 * hashing, snapshot exclusion, receipt construction, pure receipt validation,
 * and the net-new fail-closed ledger reader.
 *
 * Acyclic module graph contract:
 * - This module MUST NOT import `ultragoal-runtime.ts` or `ultragoal-guard.ts`.
 *   Runtime imports this module (`runtime -> receipt`); guard imports this module
 *   plus runtime (`guard -> receipt + runtime`). Receipt only depends on
 *   `shared/state/state-writer.ts`, `shared/session/paths.ts`, and `node:crypto` / `node:fs/promises`.
 * - No `Bun.*` APIs (portability: Node-only).
 *
 * Field-name mapping from Gajae (locked, do not re-litigate):
 *   gjcGoalMode        -> goalMode
 *   gjcObjective        -> objective
 *   gjcObjectiveAliases -> objectiveAliases
 *   gjcGoalSnapshotHash -> goalSnapshotHash
 *   event.gjcGoalJson   -> event.goalJson
 *
 * The ledger `goal_checkpointed` event gains additive `qualityGateJson` +
 * `goalJson` fields so `validateCompletionReceipt` can re-hash and compare.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assembleFinalPackage, type WorkflowFinalPackage } from "#workflows/harness/shared/artifacts/artifacts";
import { ultragoalLedgerPath } from "#workflows/harness/shared/session/session-layout";
import { canonicalizeJson } from "#workflows/harness/shared/state/state-writer";

export type UltragoalGoalStatus =
	| "pending"
	| "active"
	| "complete"
	| "failed"
	| "blocked"
	| "review_blocked"
	| "superseded";

export type UltragoalGoalMode = "aggregate" | "per-story";

export type UltragoalReceiptKind = "per-goal" | "final-aggregate";

export interface UltragoalGoal {
	id: string;
	title: string;
	objective: string;
	status: UltragoalGoalStatus;
	createdAt: string;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	evidence?: string;
	steering?: { kind: string; blockedGoalId?: string };
	completionVerification?: UltragoalCompletionVerification;
}

export interface UltragoalPlan {
	version: 1;
	brief: string;
	goalMode: UltragoalGoalMode;
	objective: string;
	objectiveAliases?: string[];
	goals: UltragoalGoal[];
	createdAt: string;
	updatedAt: string;
}

/**
 * Completion verification receipt (Gajae-faithful shape, Pi-native field names).
 *
 * `planGeneration = hashStructuredValue(basis)` where `basis` is the 5-field object
 * below. `qualityGateHash` and `goalSnapshotHash` are content hashes of the
 * quality-gate JSON and goal JSON stored in the checkpoint ledger event. The
 * direct `goal.updatedAt !== receipt.verifiedAt` drift check is performed at
 * validation time.
 */
export interface UltragoalCompletionVerification {
	schemaVersion: 2;
	receiptId: string;
	verifiedAt: string;
	goalId: string;
	receiptKind: UltragoalReceiptKind;
	goalStatusBeforeCheckpoint: UltragoalGoalStatus;
	goalMode: UltragoalGoalMode;
	objective: string;
	qualityGateHash: string;
	goalSnapshotHash: string;
	transitionSnapshotHash: string;
	planGeneration: string;
	basis: {
		planHashBeforeCheckpoint: string;
		latestRelevantLedgerEventIdBeforeCheckpoint: string | null;
		goalUpdatedAtBeforeCheckpoint: string;
		relevantGoalIdsBeforeCheckpoint: string[];
		requiredGoalSetHashBeforeCheckpoint: string;
	};
	checkpointLedgerEventId: string;
	finalPackage?: WorkflowFinalPackage;
}

/**
 * Ledger event row (JSONL). The index signature keeps it structurally compatible
 * with `Record<string, unknown>` so the runtime's `appendLedger` can pass through
 * additive `qualityGateJson` / `goalJson` fields without a dedicated write path.
 */
export interface UltragoalLedgerEvent {
	eventId?: string;
	event?: string;
	goalId?: string;
	timestamp?: string;
	status?: string;
	statusBefore?: string;
	evidenceSha256?: string;
	completionVerification?: UltragoalCompletionVerification;
	qualityGateJson?: unknown;
	goalJson?: unknown;
	supersededGoalId?: string;
	supersededGoalJson?: unknown;
	supersessionEvidence?: string;
	[key: string]: unknown;
}

/**
 * Diagnostic subset returned by `validateCompletionReceipt`. The guard owns the
 * full 9-state enum (`UltragoalGuardState`); receipt only emits the states a
 * receipt can produce, so it never needs to import the guard (no back-edge).
 */
export type UltragoalReceiptDiagnosticState =
	| "active_verified_complete"
	| "active_missing_receipt"
	| "active_stale_receipt"
	| "active_missing_final_receipt"
	| "active_dirty_quality_gate";

export interface UltragoalReceiptDiagnostic {
	state: UltragoalReceiptDiagnosticState;
	message: string;
	goalId?: string;
}

/**
 * Typed error thrown by `readUltragoalLedger` when the ledger is present but
 * unreadable (corrupt JSONL). Callers (guard, runtime) map this to the
 * `unreadable_fail_closed` state. A missing ledger file is NOT unreadable: it
 * yields an empty array (no error).
 */
export class UltragoalLedgerUnreadable extends Error {
	public readonly path: string;
	public readonly line: number;
	public constructor(path: string, line: number, message: string) {
		super(`ultragoal ledger unreadable at ${path}:${line}: ${message}`);
		this.name = "UltragoalLedgerUnreadable";
		this.path = path;
		this.line = line;
	}
}

const TERMINAL_STATUSES = new Set<UltragoalGoalStatus>(["complete", "superseded"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deterministic structured-value hash.
 *
 * `hashStructuredValue(value) = sha256(JSON.stringify(canonicalizeJson(value)))`.
 * Stable across key insertion order because `canonicalizeJson` sorts keys and
 * strips `undefined`. Single source of truth: no second stable-serializer.
 */
export function hashStructuredValue(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalizeJson(value)))
		.digest("hex");
}

/** Required (non-superseded) goals of a plan. */
export function requiredGoals(plan: UltragoalPlan): UltragoalGoal[] {
	return plan.goals.filter((goal) => goal.status !== "superseded");
}

/**
 * Goals whose state is relevant to a receipt's basis.
 * - `final-aggregate`: every required goal (the aggregate snapshot).
 * - `per-goal`: only the target goal itself.
 */
export function receiptRelevantGoals(
	plan: UltragoalPlan,
	goal: UltragoalGoal,
	receiptKind: UltragoalReceiptKind,
): UltragoalGoal[] {
	return receiptKind === "final-aggregate" ? requiredGoals(plan) : [goal];
}

/** Stable event id of a ledger row, or null when absent/blank. */
export function ledgerEventId(event: UltragoalLedgerEvent): string | null {
	return typeof event.eventId === "string" && event.eventId.trim().length > 0 ? event.eventId : null;
}

/**
 * Latest ledger event id relevant to `relevantGoalIds`, scanning newest-first.
 * Events whose `goalId` is absent (e.g. `plan_created`) count as relevant to
 * every goal. `excludeEventId` excludes a single event (the receipt's own
 * checkpoint event) so a freshly written receipt does not self-stale.
 */
export function latestRelevantLedgerEventId(
	ledger: readonly UltragoalLedgerEvent[],
	relevantGoalIds: readonly string[],
	excludeEventId?: string,
): string | null {
	const relevant = new Set(relevantGoalIds);
	for (const event of [...ledger].reverse()) {
		const eventId = ledgerEventId(event);
		if (!eventId) continue;
		if (excludeEventId !== undefined && eventId === excludeEventId) continue;
		const goalId = typeof event.goalId === "string" ? event.goalId : null;
		if (!goalId || relevant.has(goalId)) return eventId;
	}
	return null;
}

/**
 * Plan snapshot used to compute `planHashBeforeCheckpoint`.
 *
 * Excludes `completionVerification`/`evidence`/`completedAt` and the plan-level
 * `updatedAt`, restores the target goal's `status` to `beforeStatus` and
 * `updatedAt` to the checkpoint `now`, and (for `final-aggregate`) strips
 * `completionVerification` from every goal. This guarantees completing one
 * goal never stales a sibling's pre-existing receipt: a sibling goal's
 * `completionVerification`/`evidence`/`completedAt` changes do not enter the
 * snapshot, and the plan's own `updatedAt` bump is excluded.
 *
 * Ported verbatim from Gajae's `planSnapshotForReceipt` (Pi-native field names).
 */
export function planSnapshotForReceipt(input: {
	plan: UltragoalPlan;
	goal: UltragoalGoal;
	beforeStatus: UltragoalGoalStatus;
	targetGoalUpdatedAt: string;
	receiptKind: UltragoalReceiptKind;
}): unknown {
	const targetGoalSnapshot = {
		...input.goal,
		status: input.beforeStatus,
		updatedAt: input.targetGoalUpdatedAt,
		evidence: undefined,
		completedAt: undefined,
		completionVerification: undefined,
	};
	const goals =
		input.receiptKind === "final-aggregate"
			? input.plan.goals.map((goal) => ({
					...goal,
					status: goal.id === input.goal.id ? input.beforeStatus : goal.status,
					updatedAt: goal.id === input.goal.id ? input.targetGoalUpdatedAt : goal.updatedAt,
					evidence: goal.id === input.goal.id ? undefined : goal.evidence,
					completedAt: goal.id === input.goal.id ? undefined : goal.completedAt,
					completionVerification: undefined,
				}))
			: [targetGoalSnapshot];
	return {
		version: input.plan.version,
		brief: input.plan.brief,
		goalMode: input.plan.goalMode,
		objective: input.plan.objective,
		objectiveAliases: input.plan.objectiveAliases,
		createdAt: input.plan.createdAt,
		goals,
	};
}

/**
 * Compute `planGeneration` and the 5-field `basis` for a receipt.
 *
 * `excludeEventId` is a mandatory contract at validation time (set to
 * `receipt.checkpointLedgerEventId`) and passed at build time (set to the
 * checkpoint event id) so the receipt's own checkpoint event never self-stales.
 * `targetGoalUpdatedAt` is the checkpoint `now` at build time; defaults to the
 * goal's current `updatedAt` at validation time.
 */
export function computeUltragoalPlanGeneration(input: {
	plan: UltragoalPlan;
	ledger: readonly UltragoalLedgerEvent[];
	goal: UltragoalGoal;
	receiptKind: UltragoalReceiptKind;
	beforeStatus: UltragoalGoalStatus;
	excludeEventId?: string;
	targetGoalUpdatedAt?: string;
}): { planGeneration: string; basis: UltragoalCompletionVerification["basis"] } {
	const relevantGoals = receiptRelevantGoals(input.plan, input.goal, input.receiptKind);
	const relevantGoalIds = relevantGoals.map((goal) => goal.id);
	const targetGoalUpdatedAt = input.targetGoalUpdatedAt ?? input.goal.updatedAt;
	const planHashBeforeCheckpoint = hashStructuredValue(
		planSnapshotForReceipt({
			plan: input.plan,
			goal: input.goal,
			beforeStatus: input.beforeStatus,
			targetGoalUpdatedAt,
			receiptKind: input.receiptKind,
		}),
	);
	const requiredGoalSetHashBeforeCheckpoint = hashStructuredValue(
		relevantGoals.map((goal) => ({
			id: goal.id,
			status: goal.id === input.goal.id ? input.beforeStatus : goal.status,
			updatedAt: goal.id === input.goal.id ? targetGoalUpdatedAt : goal.updatedAt,
		})),
	);
	const basis: UltragoalCompletionVerification["basis"] = {
		planHashBeforeCheckpoint,
		latestRelevantLedgerEventIdBeforeCheckpoint: latestRelevantLedgerEventId(
			input.ledger,
			relevantGoalIds,
			input.excludeEventId,
		),
		goalUpdatedAtBeforeCheckpoint: targetGoalUpdatedAt,
		relevantGoalIdsBeforeCheckpoint: relevantGoalIds,
		requiredGoalSetHashBeforeCheckpoint,
	};
	return { planGeneration: hashStructuredValue(basis), basis };
}

/**
 * Choose the receipt kind for a checkpoint.
 *
 * - `per-story` mode always uses `per-goal`.
 * - Non-`complete` checkpoints always use `per-goal`.
 * - `aggregate` + `complete` + no unfinished required sibling -> `final-aggregate`.
 * - Otherwise `per-goal`.
 *
 * The off-by-one is pinned here: the goal being completed is excluded from the
 * "unfinished required siblings" set, so the last required goal yields
 * `final-aggregate`, and the second-to-last yields `per-goal`.
 */
export function chooseReceiptKind(
	plan: UltragoalPlan,
	goal: UltragoalGoal,
	status: UltragoalGoalStatus,
): UltragoalReceiptKind {
	if (plan.goalMode === "per-story") return "per-goal";
	if (status !== "complete") return "per-goal";
	const unfinishedRequiredGoals = requiredGoals(plan).filter(
		(item) => item.id !== goal.id && !TERMINAL_STATUSES.has(item.status),
	);
	return unfinishedRequiredGoals.length === 0 ? "final-aggregate" : "per-goal";
}

/**
 * Build a completion-verification receipt.
 *
 * `qualityGateJson` and `goalJson` are the validated typed quality-gate object
 * and the goal JSON that will be stored (additively) in the checkpoint ledger
 * event. Their content hashes are captured here so `validateCompletionReceipt`
 * can re-hash the stored event and detect drift.
 *
 * `excludeEventId = checkpointLedgerEventId` is passed so the receipt's own
 * checkpoint event does not self-stale, and `targetGoalUpdatedAt = now` so the
 * snapshot reflects the pre-write goal state at checkpoint time.
 */
export function buildCompletionReceipt(input: {
	plan: UltragoalPlan;
	ledger: readonly UltragoalLedgerEvent[];
	goal: UltragoalGoal;
	receiptKind: UltragoalReceiptKind;
	beforeStatus: UltragoalGoalStatus;
	qualityGateJson: Record<string, unknown>;
	goalJson: Record<string, unknown>;
	transitionJson?: Record<string, unknown>;
	now: string;
	checkpointLedgerEventId: string;
}): UltragoalCompletionVerification {
	const generation = computeUltragoalPlanGeneration({
		plan: input.plan,
		ledger: input.ledger,
		goal: input.goal,
		receiptKind: input.receiptKind,
		beforeStatus: input.beforeStatus,
		targetGoalUpdatedAt: input.now,
		excludeEventId: input.checkpointLedgerEventId,
	});
	return {
		schemaVersion: 2,
		receiptId: randomUUID(),
		verifiedAt: input.now,
		goalId: input.goal.id,
		receiptKind: input.receiptKind,
		goalStatusBeforeCheckpoint: input.beforeStatus,
		goalMode: input.plan.goalMode,
		objective: input.plan.objective,
		qualityGateHash: hashStructuredValue(input.qualityGateJson),
		goalSnapshotHash: hashStructuredValue(input.goalJson),
		transitionSnapshotHash: hashStructuredValue(input.transitionJson ?? input.goalJson),
		planGeneration: generation.planGeneration,
		basis: generation.basis,
		checkpointLedgerEventId: input.checkpointLedgerEventId,
		...(input.receiptKind === "final-aggregate"
			? { finalPackage: assembleFinalPackage(input.transitionJson ?? input.goalJson) }
			: {}),
	};
}

function findLedgerReceiptEvent(
	ledger: readonly UltragoalLedgerEvent[],
	receipt: UltragoalCompletionVerification,
): UltragoalLedgerEvent | undefined {
	return ledger.find((event) => {
		if (event.eventId !== receipt.checkpointLedgerEventId) return false;
		if (event.event !== "goal_checkpointed") return false;
		if (event.goalId !== receipt.goalId) return false;
		const eventReceipt = event.completionVerification;
		if (event.status !== "complete") return false;
		return (
			isPlainObject(eventReceipt) &&
			eventReceipt.receiptId === receipt.receiptId &&
			eventReceipt.receiptKind === receipt.receiptKind &&
			eventReceipt.planGeneration === receipt.planGeneration
		);
	});
}

/**
 * Pure receipt validation (no I/O). Ported from Gajae's `validateCompletionReceipt`.
 *
 * Returns the diagnostic state for a goal's stored receipt against the current
 * plan and ledger. The guard wraps this with read-side state classification;
 * the runtime calls it after the checkpoint write (with `ledger` re-read) to
 * confirm the stored receipt is fresh before returning. `excludeEventId` is
 * taken from `receipt.checkpointLedgerEventId` so the receipt's own event is
 * excluded from the basis recomputation.
 *
 * State precedence (matches Gajae):
 *  1. missing receipt -> `active_missing_final_receipt` (final-aggregate) or
 *     `active_missing_receipt`.
 *  2. malformed receipt / missing ledger event -> `active_stale_receipt`.
 *  3. recomputed `planGeneration` != stored -> `active_stale_receipt`.
 *  4. `qualityGateHash` != re-hash of `event.qualityGateJson` ->
 *     `active_dirty_quality_gate`.
 *  5. `goalSnapshotHash` != re-hash of `event.goalJson` -> `active_stale_receipt`.
 *  6. `goal.updatedAt` != `receipt.verifiedAt` -> `active_stale_receipt`.
 *  7. `final-aggregate` completeness / sibling-receipt checks ->
 *     `active_missing_final_receipt` / `active_missing_receipt`.
 *  8. otherwise -> `active_verified_complete`.
 */
function hasCompleteFinalPackage(receipt: UltragoalCompletionVerification): boolean {
	if (!receipt.finalPackage) return false;
	return "report" in receipt.finalPackage && "changelog" in receipt.finalPackage && "handoff" in receipt.finalPackage;
}

export function validateCompletionReceipt(input: {
	plan: UltragoalPlan;
	ledger: readonly UltragoalLedgerEvent[];
	goal: UltragoalGoal;
	receiptKind: UltragoalReceiptKind;
}): UltragoalReceiptDiagnostic {
	const receipt = input.goal.completionVerification;
	if (!receipt) {
		return {
			state: input.receiptKind === "final-aggregate" ? "active_missing_final_receipt" : "active_missing_receipt",
			message: `Ultragoal ${input.goal.id} has no ${input.receiptKind} completion verification receipt.`,
			goalId: input.goal.id,
		};
	}
	if (
		receipt.schemaVersion !== 2 ||
		receipt.goalId !== input.goal.id ||
		receipt.receiptKind !== input.receiptKind ||
		!receipt.planGeneration ||
		!receipt.checkpointLedgerEventId ||
		(input.receiptKind === "final-aggregate" && !hasCompleteFinalPackage(receipt))
	) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt is malformed or stale.`,
			goalId: input.goal.id,
		};
	}
	const event = findLedgerReceiptEvent(input.ledger, receipt);
	if (!event) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt ledger event is missing.`,
			goalId: input.goal.id,
		};
	}
	const generation = computeUltragoalPlanGeneration({
		plan: input.plan,
		ledger: input.ledger,
		goal: input.goal,
		receiptKind: input.receiptKind,
		beforeStatus: receipt.goalStatusBeforeCheckpoint,
		excludeEventId: receipt.checkpointLedgerEventId,
	});
	if (generation.planGeneration !== receipt.planGeneration) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt generation is stale.`,
			goalId: input.goal.id,
		};
	}
	if (hashStructuredValue(event.qualityGateJson) !== receipt.qualityGateHash) {
		return {
			state: "active_dirty_quality_gate",
			message: `Ultragoal ${input.goal.id} receipt quality-gate hash does not match ledger.`,
			goalId: input.goal.id,
		};
	}
	if (hashStructuredValue(event.goalJson) !== receipt.goalSnapshotHash) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt goal snapshot hash does not match ledger.`,
			goalId: input.goal.id,
		};
	}
	const transitionSnapshot = event.supersededGoalJson
		? { goalJson: event.goalJson, supersededGoalJson: event.supersededGoalJson }
		: event.goalJson;
	if (hashStructuredValue(transitionSnapshot) !== receipt.transitionSnapshotHash) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt transition snapshot hash does not match ledger.`,
			goalId: input.goal.id,
		};
	}
	if (input.goal.updatedAt !== receipt.verifiedAt) {
		return {
			state: "active_stale_receipt",
			message: `Ultragoal ${input.goal.id} receipt target changed after verification.`,
			goalId: input.goal.id,
		};
	}
	if (input.receiptKind === "final-aggregate") {
		const incomplete = requiredGoals(input.plan).filter((goal) => goal.status !== "complete");
		if (incomplete.length > 0) {
			return {
				state: "active_missing_final_receipt",
				message: `Ultragoal final receipt is not valid while required goals remain incomplete: ${incomplete.map((goal) => goal.id).join(", ")}.`,
				goalId: input.goal.id,
			};
		}
		const missingReceipts = requiredGoals(input.plan).filter(
			(goal) => goal.id !== input.goal.id && !goal.completionVerification,
		);
		if (missingReceipts.length > 0) {
			return {
				state: "active_missing_receipt",
				message: `Ultragoal final receipt is missing per-goal evidence for: ${missingReceipts.map((goal) => goal.id).join(", ")}.`,
				goalId: input.goal.id,
			};
		}
	}
	return {
		state: "active_verified_complete",
		message: `Ultragoal ${input.goal.id} has a fresh ${input.receiptKind} receipt.`,
		goalId: input.goal.id,
	};
}

/**
 * Read the ultragoal ledger (net-new, fail-closed).
 *
 * Missing file = empty ledger (`[]`). A present-but-unparseable JSONL line
 * throws `UltragoalLedgerUnreadable`; callers map that to the
 * `unreadable_fail_closed` guard state. Uses only `node:fs/promises` (no
 * `Bun.*`) for portability, with ENOENT handling consistent with
 * `state-writer.ts`'s `readExistingStateForMutation`.
 */
export async function readUltragoalLedger(cwd: string, sessionId: string): Promise<UltragoalLedgerEvent[]> {
	const path = ultragoalLedgerPath(cwd, sessionId);
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return [];
		throw error;
	}
	const lines = raw.split(/\r?\n/);
	const events: UltragoalLedgerEvent[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			throw new UltragoalLedgerUnreadable(path, index + 1, error instanceof Error ? error.message : String(error));
		}
		if (!isPlainObject(parsed)) {
			throw new UltragoalLedgerUnreadable(path, index + 1, "ledger line is not a JSON object");
		}
		events.push(parsed as UltragoalLedgerEvent);
	}
	return events;
}
