import type { RetryDecision } from "#agent/orchestrator/types";

export const DEFAULT_RETRY_DELAY_MS = 1000;
export const DEFAULT_RETRY_BACKOFF = 2;
export const DEFAULT_RETRY_JITTER_RATIO = 0.2;

export class OrchestratorAbortError extends Error {
	constructor(message = "Run aborted by abort signal.") {
		super(message);
		this.name = "AbortError";
	}
}

export function resolveRetryCount(value?: number): number {
	if (value === undefined) return 0;
	if (!Number.isFinite(value) || value < 0)
		throw new RangeError("Task maxRetries must be a finite, non-negative number.");
	return Math.floor(value);
}

export function resolveRetryDelay(value?: number): number {
	if (value === undefined) return DEFAULT_RETRY_DELAY_MS;
	if (!Number.isFinite(value) || value < 0)
		throw new RangeError("Task retryDelayMs must be a finite, non-negative number.");
	return Math.floor(value);
}

export function resolveRetryBackoff(value?: number): number {
	if (value === undefined) return DEFAULT_RETRY_BACKOFF;
	if (!Number.isFinite(value) || value < 1)
		throw new RangeError("Task retryBackoff must be a finite number greater than or equal to 1.");
	return value;
}

export function formatFailureMessage(error: unknown, output: string): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.length > 0) return error;
	return output || String(error);
}

export function computeRetryDecision(
	baseDelayMs: number,
	backoff: number,
	attempts: number,
	jitterRatio = DEFAULT_RETRY_JITTER_RATIO,
	random = Math.random,
): RetryDecision {
	const exponentialDelayMs = Math.max(0, Math.round(baseDelayMs * backoff ** Math.max(0, attempts - 1)));
	const jitterWindowMs = Math.round(exponentialDelayMs * jitterRatio);
	const jitterMs = jitterWindowMs === 0 ? 0 : Math.round((random() * 2 - 1) * jitterWindowMs);
	return Object.freeze({
		attempt: attempts,
		nextAttempt: attempts + 1,
		exponentialDelayMs,
		jitterRatio,
		jitterMs,
		delayMs: Math.max(0, exponentialDelayMs + jitterMs),
	});
}

export function isAbortError(error: unknown): boolean {
	if (error instanceof OrchestratorAbortError) return true;
	if (error instanceof Error) return error.name === "AbortError" || error.message.toLowerCase() === "aborted";
	return false;
}

export function wait(ms: number, abortSignal?: AbortSignal): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	if (!abortSignal) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
	if (abortSignal.aborted) return Promise.reject(new OrchestratorAbortError());
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			abortSignal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timeout);
			abortSignal.removeEventListener("abort", onAbort);
			reject(new OrchestratorAbortError());
		};
		abortSignal.addEventListener("abort", onAbort, { once: true });
	});
}
