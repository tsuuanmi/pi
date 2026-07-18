import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { WorkflowSkill } from "../shared/paths.ts";
import { evaluateSkillGateValidators, evaluateSkillTerminalDetectors } from "../shared/skill-registry.ts";
import { readWorkflowState } from "../shared/workflow-state.ts";
import { mutateRuntimeSession } from "./mutation.ts";
import { preserveDirtyWorktree } from "./preservation.ts";
import type { HarnessRpc } from "./rpc.ts";
import { singleFlightAccept } from "./rpc.ts";
import { seamUnsupported } from "./seams.ts";
import { buildResponse } from "./state.ts";
import { readRuntimeReceipts, readSessionState } from "./storage.ts";
import type {
	GitDelta,
	HarnessLifecycle,
	PrimitiveResponse,
	RuntimeReceipt,
	RuntimeWriter,
	SessionState,
} from "./types.ts";
import {
	buildVanishEvidence,
	requiresVanishBeforeAction,
	type VanishClassification,
	validateVanish,
} from "./vanish.ts";

export type WorkspaceMarkerStatus = "available" | "not-git" | "git-unavailable" | "unknown" | "deleted";
export type WorkspaceRisk = "normal" | "dirty" | "deleted" | "unknown" | "not-git";
export type RecoveryDecisionKind =
	| "continue"
	| "reinject-prompt"
	| "restart-clean"
	| "restart-preserve-delta"
	| "fallback-harness-exec"
	| "finalize-blocked"
	| "human-check"
	| "blocked";

export interface WorkspaceMarker {
	workspace: string;
	status: WorkspaceMarkerStatus;
	head: string | null;
	gitDelta: GitDelta;
	risk: WorkspaceRisk;
}

export interface RuntimeSnapshot {
	ownerLive: boolean;
	rpcLive: boolean | null;
	rpcIdle: boolean | null;
	lastFrameAt: string | null;
}

export interface ClassificationInput {
	state: SessionState;
	ownerLive: boolean;
	runtime: RuntimeSnapshot;
	workspace: WorkspaceMarker;
	recentSignals: string[];
	latestValidation: ValidationReceiptSummary | null;
	retryBudget: RetryBudget;
}

export interface RetryBudget {
	reinjectPrompt: number;
	zeroDeltaVanish: number;
	dirtyVanishPreserve: number;
	validationRepair: number;
}

export interface RecoveryDecision {
	classification: RecoveryDecisionKind;
	reason: string;
	severity: "info" | "warn" | "critical";
	ownerRequired: boolean;
	blocked: boolean;
	blockers: string[];
}

export interface ValidationCheckInput {
	name: string;
	command: string;
	timeoutMs?: number;
}

export interface ValidationCheckEvidence {
	name: string;
	command: string;
	cwd: string;
	startedAt: string;
	endedAt: string;
	durationMs: number;
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	stdoutSummary: string;
	stderrSummary: string;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
	passed: boolean;
}

export interface ValidationEvidence extends Record<string, unknown> {
	schemaVersion: 1;
	verb: "validate";
	sessionId: string;
	checks: ValidationCheckEvidence[];
	overallPassed: boolean;
	workspaceMarker: WorkspaceMarker;
	retryBudget: { consumed: number; remaining: number };
	createdAt: string;
}

export interface ValidationReceiptSummary {
	receiptId: string;
	contentSha256: string;
	valid: boolean;
	evidence: ValidationEvidence | null;
}

const DEFAULT_RETRY_BUDGET: RetryBudget = {
	reinjectPrompt: 2,
	zeroDeltaVanish: 1,
	dirtyVanishPreserve: 1,
	validationRepair: 2,
};

const DEFAULT_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 8_000;

function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inputNumber(input: Record<string, unknown>, key: string): number | undefined {
	const value = input[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function gitOutput(workspace: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd: workspace,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

export function buildWorkspaceMarker(workspace: string, base?: string | null): WorkspaceMarker {
	if (!existsSync(workspace)) {
		return { workspace, status: "deleted", head: null, gitDelta: "unknown", risk: "deleted" };
	}
	const inside = gitOutput(workspace, ["rev-parse", "--is-inside-work-tree"]);
	if (inside !== "true") {
		return { workspace, status: "not-git", head: null, gitDelta: "unknown", risk: "not-git" };
	}
	const head = gitOutput(workspace, ["rev-parse", "HEAD"]);
	const porcelain = gitOutput(workspace, ["status", "--porcelain", "--", ".", ":!.pi"]);
	if (porcelain === null) {
		return { workspace, status: "git-unavailable", head, gitDelta: "unknown", risk: "unknown" };
	}
	let gitDelta: GitDelta;
	if (porcelain.length > 0) {
		gitDelta = "dirty";
	} else if (base !== null && base !== undefined && head !== null && head !== base) {
		// porcelain-clean but HEAD advanced past the recorded base: a commit landed with no working-tree change.
		gitDelta = "zero-delta";
	} else {
		gitDelta = "clean";
	}
	return { workspace, status: "available", head, gitDelta, risk: gitDelta === "dirty" ? "dirty" : "normal" };
}

function parseRetryBudget(input: Record<string, unknown>, state: SessionState): RetryBudget {
	const override = input.retryBudget;
	const source =
		override && typeof override === "object" && !Array.isArray(override) ? (override as Record<string, unknown>) : {};
	return {
		reinjectPrompt:
			typeof source.reinjectPrompt === "number"
				? source.reinjectPrompt
				: DEFAULT_RETRY_BUDGET.reinjectPrompt - (state.retries.reinjectPrompt ?? 0),
		zeroDeltaVanish:
			typeof source.zeroDeltaVanish === "number"
				? source.zeroDeltaVanish
				: DEFAULT_RETRY_BUDGET.zeroDeltaVanish - (state.retries.zeroDeltaVanish ?? 0),
		dirtyVanishPreserve:
			typeof source.dirtyVanishPreserve === "number"
				? source.dirtyVanishPreserve
				: DEFAULT_RETRY_BUDGET.dirtyVanishPreserve - (state.retries.dirtyVanishPreserve ?? 0),
		validationRepair:
			typeof source.validationRepair === "number"
				? source.validationRepair
				: DEFAULT_RETRY_BUDGET.validationRepair - (state.retries.validationRepair ?? 0),
	};
}

function receiptHash(seed: Omit<RuntimeReceipt, "contentSha256">): string {
	return createHash("sha256").update(JSON.stringify(seed)).digest("hex");
}

export function isRuntimeReceiptValid(receipt: RuntimeReceipt): boolean {
	const { contentSha256, ...seed } = receipt;
	return receiptHash(seed) === contentSha256;
}

function isValidationEvidence(value: unknown, sessionId: string): value is ValidationEvidence {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		record.schemaVersion === 1 &&
		record.verb === "validate" &&
		record.sessionId === sessionId &&
		Array.isArray(record.checks) &&
		typeof record.overallPassed === "boolean"
	);
}

function summarizeLatestValidation(receipts: RuntimeReceipt[], sessionId: string): ValidationReceiptSummary | null {
	for (let index = receipts.length - 1; index >= 0; index--) {
		const receipt = receipts[index];
		if (receipt?.verb !== "validate" || receipt.sessionId !== sessionId) continue;
		const valid = isRuntimeReceiptValid(receipt) && isValidationEvidence(receipt.evidence, sessionId);
		return {
			receiptId: receipt.receiptId,
			contentSha256: receipt.contentSha256,
			valid,
			evidence: valid ? (receipt.evidence as unknown as ValidationEvidence) : null,
		};
	}
	return null;
}

export async function buildClassificationInput(opts: {
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	receipts?: RuntimeReceipt[];
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

export function classifyRecovery(input: ClassificationInput): RecoveryDecision {
	const lifecycle = input.state.lifecycle;
	if (lifecycle === "completed" || lifecycle === "retired") {
		return {
			classification: "blocked",
			reason: `lifecycle-terminal:${lifecycle}`,
			severity: "warn",
			ownerRequired: false,
			blocked: true,
			blockers: [`lifecycle-terminal:${lifecycle}`],
		};
	}
	// Deleted worktree / path mismatch is human-check in both branches (never recreate over unknown data).
	if (input.workspace.risk === "deleted") {
		return {
			classification: "human-check",
			reason: "deleted-worktree",
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: ["deleted-worktree"],
		};
	}
	if (input.ownerLive) {
		// Owner is live: act on observed signals, not on gitDelta (a dirty tree is normal mid-work).
		if (
			input.recentSignals.includes("no-ack") ||
			input.recentSignals.includes("no-agent-start-within-timeout") ||
			input.recentSignals.includes("prompt-not-accepted")
		) {
			if (input.retryBudget.reinjectPrompt > 0) {
				return {
					classification: "reinject-prompt",
					reason: "prompt-not-accepted",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "reinject-prompt-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["reinject-prompt-budget-exhausted"],
			};
		}
		if (
			input.recentSignals.includes("validation-failed") ||
			(input.latestValidation && !input.latestValidation.evidence?.overallPassed)
		) {
			if (input.retryBudget.validationRepair > 0) {
				return {
					classification: "continue",
					reason: "validation-failed-repair-budget-remains",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "blocked",
				reason: "validation-repair-budget-exhausted",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["validation-repair-budget-exhausted"],
			};
		}
		if (input.runtime.rpcIdle === false) {
			return {
				classification: "continue",
				reason: "runtime-busy",
				severity: "info",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		}
		return {
			classification: "continue",
			reason: "healthy",
			severity: "info",
			ownerRequired: true,
			blocked: false,
			blockers: [],
		};
	}
	// Owner / RPC vanished: branch on git delta. Every destructive branch requires a vanish receipt.
	if (input.workspace.risk === "not-git" || input.workspace.gitDelta === "unknown") {
		return {
			classification: "human-check",
			reason: "owner-vanished-unknown-delta",
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: ["owner-vanished-unknown-delta"],
		};
	}
	switch (input.workspace.gitDelta) {
		case "clean":
			return {
				classification: "restart-clean",
				reason: "owner-vanished-clean",
				severity: "warn",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		case "zero-delta":
			if (input.retryBudget.zeroDeltaVanish > 0) {
				return {
					classification: "restart-clean",
					reason: "owner-vanished-zero-delta",
					severity: "warn",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "fallback-harness-exec",
				reason: "zero-delta-vanish-budget-exhausted",
				severity: "critical",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		case "dirty":
			if (input.retryBudget.dirtyVanishPreserve > 0) {
				return {
					classification: "restart-preserve-delta",
					reason: "owner-vanished-dirty-delta",
					severity: "critical",
					ownerRequired: true,
					blocked: false,
					blockers: [],
				};
			}
			return {
				classification: "fallback-harness-exec",
				reason: "dirty-vanish-preserve-budget-exhausted",
				severity: "critical",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			};
		default:
			return {
				classification: "human-check",
				reason: "owner-vanished-unknown-delta",
				severity: "critical",
				ownerRequired: false,
				blocked: true,
				blockers: ["owner-vanished-unknown-delta"],
			};
	}
}

function budgetKeyFor(decision: RecoveryDecision, gitDelta: GitDelta): keyof RetryBudget | null {
	switch (decision.classification) {
		case "reinject-prompt":
			return "reinjectPrompt";
		case "restart-clean":
			// `clean` consumes nothing; `zero-delta` consumes one vanish budget.
			return gitDelta === "zero-delta" ? "zeroDeltaVanish" : null;
		case "restart-preserve-delta":
			return "dirtyVanishPreserve";
		case "continue":
			// `continue` consumes validationRepair only when repairing a validation failure.
			return decision.reason === "validation-failed-repair-budget-remains" ? "validationRepair" : null;
		default:
			return null;
	}
}

export function consumeBudget(state: SessionState, decision: RecoveryDecision, gitDelta: GitDelta): SessionState {
	const key = budgetKeyFor(decision, gitDelta);
	if (!key) return state;
	return { ...state, retries: { ...state.retries, [key]: (state.retries[key] ?? 0) + 1 } };
}

export async function classifyPrimitive(opts: {
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	receipts?: RuntimeReceipt[];
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
}): Promise<{ receipt: RuntimeReceipt; revalidated: boolean; vanishOk: boolean }> {
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
	const reread = await readRuntimeReceipts(opts.root, opts.state.sessionId);
	const row = [...reread.rows].reverse().find((receipt) => receipt.receiptId === vanishMutation.receipt.receiptId);
	const hashOk = row ? isRuntimeReceiptValid(row) : false;
	const vanishOk = row ? validateVanish(row.evidence).valid : false;
	// A corrupt receipt log (malformed line) is fail-closed: never proceed over an untrustworthy log.
	const revalidated = reread.diagnostics.length === 0 && row !== undefined && hashOk;
	return { receipt: vanishMutation.receipt, revalidated, vanishOk };
}

export async function recoverPrimitive(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	writer: RuntimeWriter;
	spawnOwner?: () => Promise<boolean>;
	receipts?: RuntimeReceipt[];
	/** Injected by the operate loop to skip buildClassificationInput (no double git I/O). */
	classificationInput?: ClassificationInput;
}): Promise<PrimitiveResponse> {
	const classificationInput = opts.classificationInput ?? (await buildClassificationInput(opts));
	const decision = classifyRecovery(classificationInput);
	const gitDelta = classificationInput.workspace.gitDelta;

	if (decision.blocked) return buildResponse(opts.state, opts.ownerLive, { decision, accepted: false }, false);

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
		const classification = decision.classification as VanishClassification;
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

		if (classification === "fallback-harness-exec") {
			// Provider-agnostic fallback resolves to blocked in Phase 2 (no real cross-harness exec).
			// Surface the permanently-blocked seam by name (no silent degrade) while preserving the
			// Phase 1/2 observable output (reason + blockers unchanged).
			const seam = seamUnsupported("cross-harness-omx-fallback");
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
				events: [
					{
						kind: "recovery_blocked",
						severity: "critical",
						evidence: { reason: "fallback-harness-exec-requested", seam: seam.evidence },
					},
				],
				evidence: {
					decision,
					accepted: false,
					reason: "fallback-harness-exec-requested",
					vanishReceiptId: vanish.receipt.receiptId,
					seam: seam,
				},
			});
			return buildResponse(
				mutation.state,
				opts.ownerLive,
				{
					decision,
					accepted: false,
					reason: "fallback-harness-exec-requested",
					vanishReceiptId: vanish.receipt.receiptId,
					seam: seam,
				},
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

function boundOutput(text: string): { summary: string; truncated: boolean } {
	return text.length > OUTPUT_LIMIT
		? { summary: text.slice(0, OUTPUT_LIMIT), truncated: true }
		: { summary: text, truncated: false };
}

async function runValidationCheck(check: ValidationCheckInput, cwd: string): Promise<ValidationCheckEvidence> {
	const started = Date.now();
	const startedAt = new Date(started).toISOString();
	const timeoutMs = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return await new Promise((resolve) => {
		const child = spawn("bash", ["-lc", check.command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			stderr += error.message;
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			const ended = Date.now();
			const out = boundOutput(stdout);
			const err = boundOutput(stderr);
			resolve({
				name: check.name,
				command: check.command,
				cwd,
				startedAt,
				endedAt: new Date(ended).toISOString(),
				durationMs: ended - started,
				exitCode: code,
				signal,
				timedOut,
				stdoutSummary: out.summary,
				stderrSummary: err.summary,
				stdoutTruncated: out.truncated,
				stderrTruncated: err.truncated,
				passed: code === 0 && !timedOut,
			});
		});
	});
}

function inputWorkflowSkill(input: Record<string, unknown>): WorkflowSkill | undefined {
	const value = inputString(input, "skill");
	if (value === "deep-interview" || value === "ralplan" || value === "team" || value === "ultragoal") return value;
	return undefined;
}

function parseChecks(input: Record<string, unknown>): ValidationCheckInput[] {
	const checks = input.checks;
	if (!Array.isArray(checks)) return [];
	return checks.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		const record = item as Record<string, unknown>;
		if (typeof record.name !== "string" || typeof record.command !== "string") return [];
		return [
			{
				name: record.name,
				command: record.command,
				timeoutMs: typeof record.timeoutMs === "number" ? record.timeoutMs : undefined,
			},
		];
	});
}

export async function validatePrimitive(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input: Record<string, unknown>;
	writer: RuntimeWriter;
}): Promise<PrimitiveResponse> {
	const checks = parseChecks(opts.input);
	if (checks.length === 0)
		return buildResponse(opts.state, opts.ownerLive, { reason: "validation-checks-missing" }, false);
	const results: ValidationCheckEvidence[] = [];
	for (const check of checks) results.push(await runValidationCheck(check, opts.state.handle.workspace));
	const passed = results.every((result) => result.passed);
	const nextLifecycle: HarnessLifecycle = passed ? "validating" : "blocked";
	const next: SessionState = {
		...opts.state,
		lifecycle: nextLifecycle,
		updatedAt: new Date().toISOString(),
		blockers: passed ? opts.state.blockers : ["validation-failed"],
	};
	const evidence: ValidationEvidence = {
		schemaVersion: 1,
		verb: "validate",
		sessionId: opts.state.sessionId,
		checks: results,
		overallPassed: passed,
		workspaceMarker: buildWorkspaceMarker(opts.state.handle.workspace, opts.state.handle.base),
		retryBudget: {
			consumed: opts.state.retries.validationRepair ?? 0,
			remaining: parseRetryBudget(opts.input, opts.state).validationRepair,
		},
		createdAt: new Date().toISOString(),
	};
	const mutation = await mutateRuntimeSession({
		root: opts.root,
		sessionId: opts.state.sessionId,
		verb: "validate",
		writer: opts.writer,
		accepted: passed,
		nextState: next,
		ownerLive: opts.ownerLive,
		events: [
			{
				kind: passed ? "validation_passed" : "validation_failed",
				evidence: { checks: results.map((item) => ({ name: item.name, passed: item.passed })) },
			},
		],
		evidence,
	});
	return buildResponse(mutation.state, opts.ownerLive, { validation: evidence, receipt: mutation.receipt }, passed);
}

function markersMatch(current: WorkspaceMarker, prior: WorkspaceMarker): boolean {
	if (current.status === "not-git" && prior.status === "not-git" && existsSync(current.workspace)) return true;
	return (
		current.status === "available" &&
		prior.status === "available" &&
		current.head === prior.head &&
		current.gitDelta === prior.gitDelta
	);
}

function findValidationReceipt(
	receipts: RuntimeReceipt[],
	state: SessionState,
	input: Record<string, unknown>,
): ValidationReceiptSummary | null {
	const explicit = input.validationReceiptIds;
	const candidates = receipts.filter(
		(receipt) => receipt.verb === "validate" && receipt.sessionId === state.sessionId,
	);
	if (Array.isArray(explicit) && explicit.length > 0) {
		const ids = new Set(explicit.filter((item): item is string => typeof item === "string"));
		const selected = candidates.filter((receipt) => ids.has(receipt.receiptId));
		if (selected.length !== ids.size) return null;
		const last = selected.at(-1);
		return last ? summarizeLatestValidation([last], state.sessionId) : null;
	}
	const passing = candidates.filter(
		(receipt) =>
			isRuntimeReceiptValid(receipt) &&
			isValidationEvidence(receipt.evidence, state.sessionId) &&
			receipt.evidence.overallPassed,
	);
	if (passing.length !== 1) return null;
	return summarizeLatestValidation(passing, state.sessionId);
}

export async function finalizePrimitive(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input: Record<string, unknown>;
	writer: RuntimeWriter;
	receipts: RuntimeReceipt[];
}): Promise<PrimitiveResponse> {
	const selected = findValidationReceipt(opts.receipts, opts.state, opts.input);
	const currentMarker = buildWorkspaceMarker(opts.state.handle.workspace, opts.state.handle.base);
	const blockers: string[] = [];
	const skill = inputWorkflowSkill(opts.input);
	let terminalMatched: string[] = [];
	if (skill) {
		const workspace = opts.state.handle.workspace;
		if (!workspace) {
			blockers.push("gate-read-error:missing-workspace");
		} else {
			const terminal = evaluateSkillTerminalDetectors({
				skill,
				state: undefined,
				sessionId: opts.state.sessionId,
				cwd: workspace,
				input: opts.input,
				receipts: opts.receipts,
			});
			terminalMatched = terminal.matched;
			if (!terminal.ok) blockers.push(...terminal.blockers);
			const skillState = await readWorkflowState(workspace, skill, { sessionId: opts.state.sessionId }).catch(
				() => undefined,
			);
			const gates = await evaluateSkillGateValidators({
				skill,
				state: skillState,
				sessionId: opts.state.sessionId,
				cwd: workspace,
				input: opts.input,
				receipts: opts.receipts,
			});
			if (!gates.ok) blockers.push(...gates.blockers);
		}
	}
	if (!selected) blockers.push("validation-receipt-missing-or-ambiguous");
	if (selected && !selected.valid) blockers.push("validation-receipt-invalid");
	if (selected?.evidence && !selected.evidence.overallPassed) blockers.push("validation-not-passing");
	if (selected?.evidence && !markersMatch(currentMarker, selected.evidence.workspaceMarker))
		blockers.push("validation-stale-workspace-marker");
	if (blockers.length > 0) {
		const next: SessionState = { ...opts.state, lifecycle: "blocked", blockers, updatedAt: new Date().toISOString() };
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "finalize",
			writer: opts.writer,
			accepted: false,
			nextState: next,
			ownerLive: opts.ownerLive,
			events: [{ kind: "finalize_blocked", severity: "critical", evidence: { blockers } }],
			evidence: { blockers, validation: selected, currentMarker, skill, terminalMatched },
		});
		return buildResponse(mutation.state, opts.ownerLive, { blockers, receipt: mutation.receipt }, false);
	}
	const next: SessionState = {
		...opts.state,
		lifecycle: "completed",
		blockers: [],
		updatedAt: new Date().toISOString(),
	};
	const mutation = await mutateRuntimeSession({
		root: opts.root,
		sessionId: opts.state.sessionId,
		verb: "finalize",
		writer: opts.writer,
		nextState: next,
		ownerLive: opts.ownerLive,
		events: [{ kind: "finalize_completed", evidence: { validationReceiptId: selected?.receiptId } }],
		evidence: {
			validationReceiptId: selected?.receiptId,
			validationReceiptSha256: selected?.contentSha256,
			currentMarker,
			skill,
			terminalMatched,
		},
	});
	return buildResponse(mutation.state, opts.ownerLive, {
		completed: true,
		receipt: mutation.receipt,
		skill,
		terminalMatched,
	});
}

export async function loadStateOrThrow(root: string, sessionId: string): Promise<SessionState> {
	const state = await readSessionState(root, sessionId);
	if (!state) throw new Error(`session_not_found:${sessionId}`);
	return state;
}
