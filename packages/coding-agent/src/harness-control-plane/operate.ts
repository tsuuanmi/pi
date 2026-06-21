/**
 * operate(goal, opts) — autonomous owner-driven lifecycle integrating the recovery loop.
 *
 * start -> submit(single-flight) -> [observe -> recoverPrimitive]* -> finalize(validation-gated).
 * Destructive recovery (restart-clean / restart-preserve-delta / fallback-harness-exec) writes a
 * valid vanish receipt BEFORE acting (delegated to the shared `recoverPrimitive`). Dirty/unknown
 * deltas are preserved, never clean-restarted. The loop is bounded by `maxIterations` and the
 * per-classification retry budgets persisted in `state.retries` (single budget source).
 *
 * B3 invariant: never finalize on loop exhaustion — finalize only runs on an explicitly observed
 * completion signal; exhaustion blocks with `no-observed-completion`.
 *
 * External effects (rpc, observation, owner spawn, emit) are injected so the whole lifecycle is
 * unit/e2e-testable with a fake harness (no real provider/tokens).
 */

import {
	type ClassificationInput,
	finalizePrimitive,
	loadStateOrThrow,
	type RecoveryDecision,
	type RecoveryDecisionKind,
	recoverPrimitive,
} from "./operations.ts";
import { type HarnessRpc, singleFlightAccept } from "./rpc-adapter.ts";
import { isTerminal } from "./state-machine.ts";
import { readRuntimeReceipts } from "./storage.ts";
import type { HarnessLifecycle, PrimitiveResponse, RuntimeWriter, SessionState } from "./types.ts";

export interface OperateOptions {
	root: string;
	sessionId: string;
	goal: string;
	ownerLive: boolean;
	writer: RuntimeWriter;
	rpc: HarnessRpc;
	/** Factory used to (re)create the RPC on restart recovery. Defaults to reusing `rpc`. */
	rpcFactory?: () => HarnessRpc;
	/** Real owner (re)spawn on restart; injectable for tests. */
	spawnOwner?: () => Promise<boolean>;
	/** Bounded observation provider returning a classification input (scripted in tests). */
	observe: (state: SessionState) => Promise<ClassificationInput>;
	acceptanceTimeoutMs?: number;
	maxIterations?: number;
	/** Injected event emitter (production owner passes the lease-guarded single-writer emit). */
	emit?: (kind: string, evidence: Record<string, unknown>) => Promise<void>;
	/** Injectable shared recovery primitive (defaults to recoverPrimitive; AC4 spy hook). */
	recover?: typeof recoverPrimitive;
}

export interface OperateResult {
	completed: boolean;
	lifecycle: HarnessLifecycle;
	iterations: number;
	classifications: RecoveryDecisionKind[];
	vanishReceiptIds: string[];
	blockers: string[];
	finalize?: PrimitiveResponse;
	response?: PrimitiveResponse;
}

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_ACCEPTANCE_TIMEOUT_MS = 30_000;

/**
 * Run the full autonomous loop. `recoverPrimitive` is the shared vanish-gated recovery primitive
 * (AC4): both standalone `pi workflow recover` and this loop call it, so the classify -> vanish ->
 * act -> budget path is exercised identically.
 */
export async function operate(opts: OperateOptions): Promise<OperateResult> {
	const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
	const acceptanceTimeoutMs = opts.acceptanceTimeoutMs ?? DEFAULT_ACCEPTANCE_TIMEOUT_MS;
	const emit = opts.emit ?? (async () => {});
	const classifications: RecoveryDecisionKind[] = [];
	const vanishReceiptIds: string[] = [];
	const blockers: string[] = [];

	let state = await loadStateOrThrow(opts.root, opts.sessionId);

	// Terminal check at loop entry: never submit, recover, or finalize a completed/retired session.
	if (isTerminal(state.lifecycle)) {
		blockers.push(`lifecycle-terminal:${state.lifecycle}`);
		return { completed: false, lifecycle: "blocked", iterations: 0, classifications, vanishReceiptIds, blockers };
	}

	let rpc = opts.rpc;
	const submit = async (): Promise<boolean> => {
		const acc = await singleFlightAccept(rpc, opts.goal, acceptanceTimeoutMs);
		await emit(acc.accepted ? "prompt_accepted" : "prompt_not_accepted", { reason: acc.reason });
		return acc.accepted;
	};

	await emit("operate_started", { goal: opts.goal });
	let accepted = await submit();
	let iterations = 0;
	let lifecycle: HarnessLifecycle = accepted ? "observing" : "submitted";
	let lastResponse: PrimitiveResponse | undefined;

	while (iterations < maxIterations) {
		iterations++;
		const classificationInput = await opts.observe(state);

		// Completion check BEFORE any recovery: an observed completion finalizes immediately.
		if (classificationInput.recentSignals.includes("completed") || state.lifecycle === "finalizing") {
			lifecycle = "finalizing";
			break;
		}

		const recover = opts.recover ?? recoverPrimitive;
		const response = await recover({
			root: opts.root,
			state,
			ownerLive: opts.ownerLive,
			writer: opts.writer,
			spawnOwner: opts.spawnOwner,
			rpc,
			input: { prompt: opts.goal, acceptanceTimeoutMs },
			classificationInput,
		});
		lastResponse = response;
		state = await loadStateOrThrow(opts.root, opts.sessionId);
		const decision = (response.evidence as { decision: RecoveryDecision }).decision;
		classifications.push(decision.classification);
		const vanishId = (response.evidence as { vanishReceiptId?: string }).vanishReceiptId;
		if (typeof vanishId === "string") vanishReceiptIds.push(vanishId);

		if (decision.blocked || !response.ok) {
			lifecycle = "blocked";
			blockers.push(decision.reason);
			break;
		}

		// restart-* respawned the owner (no re-submit inside the primitive); re-submit the goal.
		if (decision.classification === "restart-clean" || decision.classification === "restart-preserve-delta") {
			if (opts.rpcFactory) rpc = opts.rpcFactory();
			accepted = await submit();
		}
		// continue / reinject-prompt: the primitive already acted (reinject submits); re-observe.
	}

	if (lifecycle === "blocked") {
		await emit("operate_blocked", { blockers });
		return {
			completed: false,
			lifecycle,
			iterations,
			classifications,
			vanishReceiptIds,
			blockers,
			response: lastResponse,
		};
	}

	// B3: never finalize on loop exhaustion — require an explicit observed completion.
	if (lifecycle !== "finalizing") {
		blockers.push("no-observed-completion");
		await emit("operate_blocked", { blockers });
		return {
			completed: false,
			lifecycle: "blocked",
			iterations,
			classifications,
			vanishReceiptIds,
			blockers,
			response: lastResponse,
		};
	}

	const receipts = await readRuntimeReceipts(opts.root, opts.sessionId);
	const finalizeResponse = await finalizePrimitive({
		root: opts.root,
		state,
		ownerLive: opts.ownerLive,
		input: {},
		writer: opts.writer,
		receipts: receipts.rows,
	});
	await emit("operate_finalized", { completed: finalizeResponse.ok, blockers: finalizeResponse.evidence });
	return {
		completed: finalizeResponse.ok,
		lifecycle: finalizeResponse.state.lifecycle,
		iterations,
		classifications,
		vanishReceiptIds,
		blockers: finalizeResponse.ok ? [] : ((finalizeResponse.evidence as { blockers?: string[] }).blockers ?? []),
		finalize: finalizeResponse,
		response: lastResponse,
	};
}

export type { ClassificationInput, RecoveryDecision, RecoveryDecisionKind };
