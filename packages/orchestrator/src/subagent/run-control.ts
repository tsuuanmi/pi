export type SubagentStopReason = "cancelled" | "timed_out";

export function normalizeMaxDurationMs(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error("subagent maxDurationMs must be a positive safe integer");
	}
	return value;
}

export function maxDurationError(maxDurationMs: number): string {
	return `subagent exceeded max run time (${maxDurationMs} ms)`;
}

export class SubagentRunControl {
	readonly #controller = new AbortController();
	readonly #externalSignal?: AbortSignal;
	readonly maxDurationMs: number | undefined;
	readonly #externalAbort = () => this.stop("cancelled");
	#timer?: ReturnType<typeof setTimeout>;
	#reason?: SubagentStopReason;
	#finished = false;

	constructor(maxDurationMs: number | undefined, externalSignal?: AbortSignal) {
		this.maxDurationMs = maxDurationMs;
		this.#externalSignal = externalSignal;
		if (externalSignal?.aborted) this.stop("cancelled");
		else externalSignal?.addEventListener("abort", this.#externalAbort, { once: true });
		if (maxDurationMs !== undefined && !this.signal.aborted) {
			this.#timer = setTimeout(() => this.stop("timed_out"), maxDurationMs);
			this.#timer.unref?.();
		}
	}

	get signal(): AbortSignal {
		return this.#controller.signal;
	}

	get reason(): SubagentStopReason | undefined {
		return this.#reason;
	}

	cancel(): void {
		this.stop("cancelled");
	}

	finish(): boolean {
		if (this.signal.aborted) return false;
		this.#finished = true;
		this.clear();
		return true;
	}

	waitFor<T>(promise: Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const finish = (complete: () => void) => {
				if (settled) return;
				settled = true;
				this.signal.removeEventListener("abort", aborted);
				complete();
			};
			const aborted = () => finish(() => reject(new Error(this.errorMessage())));
			this.signal.addEventListener("abort", aborted, { once: true });
			promise.then(
				(value) => finish(() => resolve(value)),
				(error: unknown) => finish(() => reject(error)),
			);
			if (this.signal.aborted) aborted();
		});
	}

	errorMessage(error?: unknown): string {
		if (this.reason === "timed_out" && this.maxDurationMs !== undefined) {
			return maxDurationError(this.maxDurationMs);
		}
		if (error instanceof Error) return error.message;
		return error === undefined ? "subagent aborted" : String(error);
	}

	dispose(): void {
		this.#finished = true;
		this.clear();
	}

	private clear(): void {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
		this.#externalSignal?.removeEventListener("abort", this.#externalAbort);
	}

	private stop(reason: SubagentStopReason): void {
		if (this.#finished || this.signal.aborted) return;
		this.#reason = reason;
		this.clear();
		this.#controller.abort();
	}
}
