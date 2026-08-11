import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { buildResponse } from "#workflows/runtime/lifecycle";
import { mutateRuntimeSession } from "#workflows/runtime/mutation";
import { isWorkflowRuntimeReceiptValid } from "#workflows/runtime/receipt-rules";
import { parseRetryBudget } from "#workflows/runtime/recovery-policy";
import type {
	HarnessLifecycle,
	PrimitiveResponse,
	RuntimeWriter,
	SessionState,
	WorkflowRuntimeReceipt,
} from "#workflows/runtime/types";
import { buildWorkspaceMarker, type WorkspaceMarker } from "#workflows/runtime/workspace-marker";

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

const DEFAULT_TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 8_000;

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
	receipts: WorkflowRuntimeReceipt[],
	sessionId: string,
): ValidationReceiptSummary | null {
	for (let index = receipts.length - 1; index >= 0; index--) {
		const receipt = receipts[index];
		if (receipt?.verb !== "validate" || receipt.sessionId !== sessionId) continue;
		const valid = isWorkflowRuntimeReceiptValid(receipt) && isValidationEvidence(receipt.evidence, sessionId);
		return {
			receiptId: receipt.receiptId,
			contentSha256: receipt.contentSha256,
			valid,
			evidence: valid ? (receipt.evidence as unknown as ValidationEvidence) : null,
		};
	}
	return null;
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

export async function validate(opts: {
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

export function markersMatch(current: WorkspaceMarker, prior: WorkspaceMarker): boolean {
	if (current.status === "not-git" && prior.status === "not-git" && existsSync(current.workspace)) return true;
	return (
		current.status === "available" &&
		prior.status === "available" &&
		current.head === prior.head &&
		current.gitDelta === prior.gitDelta
	);
}

export function findValidationReceipt(
	receipts: WorkflowRuntimeReceipt[],
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
			isWorkflowRuntimeReceiptValid(receipt) &&
			isValidationEvidence(receipt.evidence, state.sessionId) &&
			receipt.evidence.overallPassed,
	);
	if (passing.length !== 1) return null;
	return summarizeLatestValidation(passing, state.sessionId);
}
