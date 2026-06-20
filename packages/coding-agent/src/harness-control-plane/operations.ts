import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mutateRuntimeSession } from "./mutation.ts";
import type { HarnessRpc } from "./rpc-adapter.ts";
import { singleFlightAccept } from "./rpc-adapter.ts";
import { buildResponse } from "./state-machine.ts";
import { readSessionState } from "./storage.ts";
import type {
	GitDelta,
	HarnessLifecycle,
	PrimitiveResponse,
	RuntimeReceipt,
	RuntimeWriter,
	SessionState,
} from "./types.ts";

export type WorkspaceMarkerStatus = "available" | "not-git" | "git-unavailable" | "unknown" | "deleted";
export type WorkspaceRisk = "normal" | "dirty" | "deleted" | "unknown" | "not-git";
export type RecoveryDecisionKind =
	| "continue"
	| "reinject-prompt"
	| "respawn-owner"
	| "validation-repair"
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
	ownerRespawn: number;
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
	ownerRespawn: 1,
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

export function buildWorkspaceMarker(workspace: string): WorkspaceMarker {
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
	const gitDelta: GitDelta = porcelain.length > 0 ? "dirty" : "clean";
	return { workspace, status: "available", head, gitDelta, risk: gitDelta === "dirty" ? "dirty" : "normal" };
}

export function parseRetryBudget(input: Record<string, unknown>, state: SessionState): RetryBudget {
	const override = input.retryBudget;
	const source =
		override && typeof override === "object" && !Array.isArray(override) ? (override as Record<string, unknown>) : {};
	return {
		reinjectPrompt:
			typeof source.reinjectPrompt === "number"
				? source.reinjectPrompt
				: DEFAULT_RETRY_BUDGET.reinjectPrompt - (state.retries.reinjectPrompt ?? 0),
		ownerRespawn:
			typeof source.ownerRespawn === "number"
				? source.ownerRespawn
				: DEFAULT_RETRY_BUDGET.ownerRespawn - (state.retries.ownerRespawn ?? 0),
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

export function summarizeLatestValidation(
	receipts: RuntimeReceipt[],
	sessionId: string,
): ValidationReceiptSummary | null {
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
		workspace: buildWorkspaceMarker(opts.state.handle.workspace),
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
	if (input.workspace.risk === "deleted" || input.workspace.risk === "dirty" || input.workspace.risk === "unknown") {
		return {
			classification: "human-check",
			reason: `unsafe-workspace:${input.workspace.risk}`,
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: [`unsafe-workspace:${input.workspace.risk}`],
		};
	}
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
				classification: "validation-repair",
				reason: "validation-failed-budget-remains",
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
	if (!input.ownerLive) {
		if (input.retryBudget.ownerRespawn > 0) {
			return {
				classification: "respawn-owner",
				reason: "owner-not-live",
				severity: "warn",
				ownerRequired: false,
				blocked: false,
				blockers: [],
			};
		}
		return {
			classification: "blocked",
			reason: "owner-respawn-budget-exhausted",
			severity: "critical",
			ownerRequired: false,
			blocked: true,
			blockers: ["owner-respawn-budget-exhausted"],
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
		ownerRequired: input.ownerLive,
		blocked: false,
		blockers: [],
	};
}

export function updateRetry(state: SessionState, key: keyof RetryBudget): SessionState {
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

export async function recoverPrimitive(opts: {
	root: string;
	state: SessionState;
	ownerLive: boolean;
	input?: Record<string, unknown>;
	rpc?: HarnessRpc;
	writer: RuntimeWriter;
	spawnOwner?: () => Promise<boolean>;
	receipts?: RuntimeReceipt[];
}): Promise<PrimitiveResponse> {
	const classificationInput = await buildClassificationInput(opts);
	const decision = classifyRecovery(classificationInput);
	if (decision.blocked) return buildResponse(opts.state, opts.ownerLive, { decision, accepted: false }, false);
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
		const next = updateRetry(
			{ ...opts.state, lifecycle: "observing", updatedAt: new Date().toISOString() },
			"reinjectPrompt",
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
	if (decision.classification === "respawn-owner") {
		const live = opts.spawnOwner ? await opts.spawnOwner() : false;
		if (!live)
			return buildResponse(
				opts.state,
				opts.ownerLive,
				{ decision, accepted: false, reason: "owner-liveness-proof-failed" },
				false,
			);
		const next = updateRetry(
			{ ...opts.state, lifecycle: "started", updatedAt: new Date().toISOString() },
			"ownerRespawn",
		);
		const mutation = await mutateRuntimeSession({
			root: opts.root,
			sessionId: opts.state.sessionId,
			verb: "recover",
			writer: opts.writer,
			nextState: next,
			ownerLive: true,
			events: [{ kind: "owner_respawned", evidence: { reason: decision.reason } }],
			evidence: { decision, livenessProved: true },
		});
		return buildResponse(mutation.state, true, { decision, accepted: true, receipt: mutation.receipt });
	}
	return buildResponse(
		opts.state,
		opts.ownerLive,
		{ decision, accepted: false, reason: "no-phase1-recovery-action" },
		false,
	);
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
		workspaceMarker: buildWorkspaceMarker(opts.state.handle.workspace),
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

export function findValidationReceipt(
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
	const currentMarker = buildWorkspaceMarker(opts.state.handle.workspace);
	const blockers: string[] = [];
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
			evidence: { blockers, validation: selected, currentMarker },
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
		},
	});
	return buildResponse(mutation.state, opts.ownerLive, { completed: true, receipt: mutation.receipt });
}

export async function loadStateOrThrow(root: string, sessionId: string): Promise<SessionState> {
	const state = await readSessionState(root, sessionId);
	if (!state) throw new Error(`session_not_found:${sessionId}`);
	return state;
}
