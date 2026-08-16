export interface BrowserTurnRunnerOptions {
  maxConcurrent: number;
  label: string;
}

export interface BrowserStageOptions<T> {
  label: string;
  traceId: string;
  stage: string;
  timeoutMs: number;
  action: (abortSignal: AbortSignal) => Promise<T>;
  onTimeout?: (error: BrowserStageTimeoutError) => Promise<void>;
}

export class BrowserStageTimeoutError extends Error {
  readonly code = "BROWSER_STAGE_TIMEOUT";
  readonly stage: string;
  readonly timeoutMs: number;

  constructor(stage: string, timeoutMs: number) {
    super(`Browser stage timed out after ${timeoutMs}ms: ${stage}`);
    this.name = "BrowserStageTimeoutError";
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

/** Runs one cancellable browser stage and contains timed-out provider actions. */
export async function runBrowserStage<T>(options: BrowserStageOptions<T>): Promise<T> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Browser stage timeout must be a positive finite number");
  }
  const startedAt = performance.now();
  console.info(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} started`);
  const controller = new AbortController();
  const timeoutError = new BrowserStageTimeoutError(options.stage, options.timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const action = Promise.resolve().then(() => options.action(controller.signal));
  void action.catch(() => {});
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort(timeoutError);
        reject(timeoutError);
      }, options.timeoutMs);
    });
    const value = await Promise.race([action, timeout]);
    console.info(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} completed durationMs=${Math.round(performance.now() - startedAt)}`);
    return value;
  } catch (error) {
    if (error === timeoutError && options.onTimeout) {
      try {
        await options.onTimeout(timeoutError);
      } catch (containmentError) {
        console.error(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} timeout containment failed: ${containmentError instanceof Error ? containmentError.message : String(containmentError)}`);
      }
    }
    console.error(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} failed durationMs=${Math.round(performance.now() - startedAt)}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Coordinates bounded browser turns and exclusive maintenance without provider knowledge. */
export class BrowserTurnRunner<T> {
  private readonly active = new Map<string, Promise<T>>();
  private maintenanceTail: Promise<void> = Promise.resolve();
  private maintenancePending = 0;
  private closing = false;
  private readonly options: BrowserTurnRunnerOptions;

  constructor(options: BrowserTurnRunnerOptions) {
    this.options = options;
    if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent < 1) {
      throw new Error("Browser turn capacity must be a positive integer");
    }
  }

  run(key: string, action: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error(`${this.options.label} browser runner is closing`));
    if (this.maintenancePending > 0) {
      return Promise.reject(new Error(`${this.options.label} browser maintenance is active`));
    }
    if (this.active.has(key)) {
      return Promise.reject(new Error(`Duplicate ${this.options.label} browser turn: ${key}`));
    }
    if (this.active.size >= this.options.maxConcurrent) {
      return Promise.reject(new Error(
        `${this.options.label} supports at most ${this.options.maxConcurrent} simultaneous browser turns`,
      ));
    }

    const run = Promise.resolve().then(action);
    this.active.set(key, run);
    void run.finally(() => {
      if (this.active.get(key) === run) this.active.delete(key);
    }).catch(() => {});
    return run;
  }

  enqueueMaintenance<R>(action: () => Promise<R>): Promise<R> {
    if (this.closing) return Promise.reject(new Error(`${this.options.label} browser runner is closing`));
    this.maintenancePending += 1;
    const active = [...this.active.values()];
    const operation = this.maintenanceTail
      .then(() => Promise.allSettled(active))
      .then(action);
    this.maintenanceTail = operation.then(() => undefined, () => undefined);
    return operation.finally(() => {
      this.maintenancePending -= 1;
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled([...this.active.values()]);
    await this.maintenanceTail;
  }
}
