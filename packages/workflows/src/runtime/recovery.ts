import { createHash } from "node:crypto";
import { buildResponse } from "#workflows/runtime/lifecycle";
import { mutateRuntimeSession } from "#workflows/runtime/mutation";
import { preserveDirtyWorktree } from "#workflows/runtime/preservation";
import { isWorkflowRuntimeReceiptValid } from "#workflows/runtime/receipt-rules";
import {
	type ClassificationInput,
	classifyRecovery,
	consumeBudget,
	parseRetryBudget,
	type RecoveryDecision,
} from "#workflows/runtime/recovery-policy";
import type { HarnessRpc } from "#workflows/runtime/rpc";
import { singleFlightAccept } from "#workflows/runtime/rpc";
import { readWorkflowRuntimeReceipts } from "#workflows/runtime/storage";
import type {
	GitDelta,
	PrimitiveResponse,
	RuntimeWriter,
	SessionState,
	WorkflowRuntimeReceipt,
} from "#workflows/runtime/types";
import { summarizeLatestValidation } from "#workflows/runtime/validation";
import {
	buildVanishEvidence,
	requiresVanishBeforeAction,
	type VanishClassification,
	validateVanish,
} from "#workflows/runtime/vanish";
import { buildWorkspaceMarker } from "#workflows/runtime/workspace-marker";

function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inputNumber(input: Record<string, unknown>, key: string): number | undefined {
	const value = input[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function buildClassificationInput(opts: {
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	receipts?: WorkflowRuntimeReceipt[];
}): Promise<ClassificationInput> {
	let rpcLive: boolean | null = null;
	let rpcIdle: boolean | null = null;
	let lastFrameAt: string | null = null;
	if (opts.rpc) {
		try {
			const snapshot = await opts.rpc.getState();
			rpcLive = opts.rpc.isLive?.() ?? true;
			rpcIdle = !snapshot.isStreaming && snapshot.steeringQueueDepth === 0 && snapshot.followupQueueDepth === 0;
			lastFrameAt = opts.rpc.lastFrameAt?.() ?? null;
		} catch {
			rpcLive = false;
			rpcIdle = null;
		}
	}
	return {
		state: opts.state,
		ownerLive: opts.ownerLive,
		runtime: { ownerLive: opts.ownerLive, rpcLive, rpcIdle, lastFrameAt },
		workspace: buildWorkspaceMarker(opts.state.handle.workspace, opts.state.handle.base),
		recentSignals: Array.isArray(opts.input?.signals)
			? opts.input.signals.filter((item): item is string => typeof item === "string")
			: [],
		latestValidation: summarizeLatestValidation(opts.receipts ?? [], opts.state.sessionId),
		retryBudget: parseRetryBudget(opts.input ?? {}, opts.state),
	};
}

export async function classify(opts: {
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	receipts?: WorkflowRuntimeReceipt[];
	extraEvidence?: Record<string, unknown>;
}): Promise<PrimitiveResponse> {
	const classificationInput = await buildClassificationInput(opts);
	const decision = classifyRecovery(classificationInput);
	return buildResponse(opts.state, opts.ownerLive, { ...(opts.extraEvidence ?? {}), decision, classificationInput });
}

async function writeVanishReceipt(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	writer: RuntimeWriter;
	decision: RecoveryDecision;
	gitDelta: GitDelta;
}): Promise<{ receipt: WorkflowRuntimeReceipt; revalidated: boolean; vanishOk: boolean }> {
	const classification = opts.decision.classification as VanishClassification;
	const preserve = preserveDirtyWorktree(opts.state.handle.workspace);
	const evidence = buildVanishEvidence(opts.gitDelta, preserve, classification);
	const vanishMutation = await mutateRuntimeSession({
		root: opts.root,
		sessionId: opts.state.sessionId,
		verb: "vanish",
		writer: opts.writer,
		nextState: { ...opts.state, updatedAt: new Date().toISOString() },
		ownerLive: opts.ownerLive,
		events: [
			{
				kind: "vanish_receipt",
				severity: "critical",
				evidence: { classification: opts.decision.classification, gitDelta: opts.gitDelta },
			},
		],
		evidence,
	});
	// Re-read + revalidate the just-written vanish receipt from disk (fail-closed: closes the
	// tamper-after-write + receipt-log-corruption gap that mutateRuntimeSession does not catch).
	const reread = await readWorkflowRuntimeReceipts(opts.root, opts.state.sessionId);
	const row = [...reread.rows].reverse().find((receipt) => receipt.receiptId === vanishMutation.receipt.receiptId);
	const hashOk = row ? isWorkflowRuntimeReceiptValid(row) : false;
	const vanishOk = row ? validateVanish(row.evidence).valid : false;
	// A corrupt receipt log (malformed line) is fail-closed: never proceed over an untrustworthy log.
	const revalidated = reread.diagnostics.length === 0 && row !== undefined && hashOk;
	return { receipt: vanishMutation.receipt, revalidated, vanishOk };
}

export async function recover(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	writer: RuntimeWriter;
	spawnOwner?: () => Promise<boolean>;
	receipts?: WorkflowRuntimeReceipt[];
	/** Injected by the operate loop to skip buildClassificationInput (no double git I/O). */
	classificationInput?: ClassificationInput;
}): Promise<PrimitiveResponse> {
	const classificationInput = opts.classificationInput ?? (await buildClassificationInput(opts));
	const decision = classifyRecovery(classificationInput);
	const gitDelta = classificationInput.workspace.gitDelta;

	if (decision.blocked) {
		const next: SessionState = {
			...opts.state,
			lifecycle: "blocked",
			blockers: decision.blockers,
			updatedAt: new Date().toISOString(),
		};
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "recover",
			writer: opts.writer,
			accepted: false,
			nextState: next,
			ownerLive: opts.ownerLive,
			events: [{ kind: "recovery_blocked", severity: "critical", evidence: { reason: decision.reason } }],
			evidence: { decision, accepted: false },
		});
		return buildResponse(
			mutation.state,
			opts.ownerLive,
			{ decision, accepted: false, receipt: mutation.receipt },
			false,
		);
	}

	if (decision.classification === "continue") {
		// No destructive action. Consume validationRepair only when repairing a validation failure.
		if (decision.reason === "validation-failed-repair-budget-remains") {
			const next = consumeBudget({ ...opts.state, updatedAt: new Date().toISOString() }, decision, gitDelta);
			const mutation = await mutateRuntimeSession({
				root: opts.root,
				sessionId: opts.state.sessionId,
				verb: "recover",
				writer: opts.writer,
				nextState: next,
				ownerLive: opts.ownerLive,
				events: [{ kind: "validation_repair_continued", evidence: { reason: decision.reason } }],
				evidence: { decision, accepted: true },
			});
			return buildResponse(mutation.state, opts.ownerLive, { decision, accepted: true, receipt: mutation.receipt });
		}
		return buildResponse(opts.state, opts.ownerLive, { decision, accepted: true });
	}

	if (decision.classification === "reinject-prompt") {
		const prompt = inputString(opts.input ?? {}, "prompt");
		if (!prompt || !opts.rpc)
			return buildResponse(
				opts.state,
				opts.ownerLive,
				{ decision, accepted: false, reason: "prompt-or-rpc-missing" },
				false,
			);
		const result = await singleFlightAccept(
			opts.rpc,
			prompt,
			inputNumber(opts.input ?? {}, "acceptanceTimeoutMs") ?? 30_000,
		);
		if (!result.accepted)
			return buildResponse(opts.state, opts.ownerLive, { decision, accepted: false, result }, false);
		const next = consumeBudget(
			{ ...opts.state, lifecycle: "observing", updatedAt: new Date().toISOString() },
			decision,
			gitDelta,
		);
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "recover",
			writer: opts.writer,
			nextState: next,
			ownerLive: opts.ownerLive,
			events: [{ kind: "recovery_prompt_reinjected", evidence: { reason: decision.reason } }],
			evidence: {
				decision,
				promptSha256: createHash("sha256").update(prompt).digest("hex"),
				promptLength: prompt.length,
				result,
			},
		});
		return buildResponse(mutation.state, opts.ownerLive, { decision, accepted: true, receipt: mutation.receipt });
	}

	if (decision.classification === "human-check") {
		return buildResponse(
			opts.state,
			opts.ownerLive,
			{ decision, accepted: false, reason: "human-check-required" },
			false,
		);
	}

	if (requiresVanishBeforeAction(decision.classification)) {
		const _classification = decision.classification as VanishClassification;
		const vanish = await writeVanishReceipt({
			root: opts.root,
			state: opts.state,
			ownerLive: opts.ownerLive,
			writer: opts.writer,
			decision,
			gitDelta,
		});
		if (!vanish.revalidated || !vanish.vanishOk) {
			const next: SessionState = {
				...opts.state,
				lifecycle: "blocked",
				blockers: ["invalid-vanish-receipt"],
				updatedAt: new Date().toISOString(),
			};
			const mutation = await mutateRuntimeSession({
				root: opts.root,
				sessionId: opts.state.sessionId,
				verb: "recover",
				writer: opts.writer,
				accepted: false,
				nextState: next,
				ownerLive: opts.ownerLive,
				events: [
					{ kind: "recovery_blocked", severity: "critical", evidence: { reason: "invalid-vanish-receipt" } },
				],
				evidence: {
					decision,
					accepted: false,
					reason: "invalid-vanish-receipt",
					vanishReceiptId: vanish.receipt.receiptId,
				},
			});
			return buildResponse(
				mutation.state,
				opts.ownerLive,
				{ decision, accepted: false, reason: "invalid-vanish-receipt", vanishReceiptId: vanish.receipt.receiptId },
				false,
			);
		}

		// restart-clean / restart-preserve-delta: respawn the owner. Re-submit is the operate loop's job.
		const live = opts.spawnOwner ? await opts.spawnOwner() : false;
		if (!live) {
			return buildResponse(
				opts.state,
				opts.ownerLive,
				{
					decision,
					accepted: false,
					reason: "owner-liveness-proof-failed",
					vanishReceiptId: vanish.receipt.receiptId,
				},
				false,
			);
		}
		const next = consumeBudget(
			{ ...opts.state, lifecycle: "started", updatedAt: new Date().toISOString() },
			decision,
			gitDelta,
		);
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "recover",
			writer: opts.writer,
			nextState: next,
			ownerLive: true,
			events: [
				{ kind: "owner_respawned", evidence: { reason: decision.reason, classification: decision.classification } },
			],
			evidence: { decision, livenessProved: true, vanishReceiptId: vanish.receipt.receiptId },
		});
		return buildResponse(mutation.state, true, {
			decision,
			accepted: true,
			receipt: mutation.receipt,
			vanishReceiptId: vanish.receipt.receiptId,
		});
	}

	return buildResponse(opts.state, opts.ownerLive, { decision, accepted: false, reason: "no-recovery-action" }, false);
}
