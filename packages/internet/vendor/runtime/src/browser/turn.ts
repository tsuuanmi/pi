export interface BrowserTurnRunnerOptions {
  maxConcurrent: number;
  label: string;
}

/** Coordinates bounded browser turns and exclusive maintenance without provider knowledge. */
export async function runBrowserStage<T>(options: {
  label: string;
  traceId: string;
  stage: string;
  timeoutMs: number;
  action: (abortSignal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const startedAt = performance.now();
  console.info(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} started`);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, rejectTimeout) => {
      timer = setTimeout(() => {
        rejectTimeout(new Error(`Browser stage timed out: ${options.stage}`));
        controller.abort();
      }, options.timeoutMs);
    });
    const value = await Promise.race([options.action(controller.signal), timeout]);
    console.info(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} completed durationMs=${Math.round(performance.now() - startedAt)}`);
    return value;
  } catch (error) {
    console.error(`[${options.label}] browser turn ${options.traceId} stage=${options.stage} failed durationMs=${Math.round(performance.now() - startedAt)}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class BrowserTurnRunner<T> {
  private readonly active = new Map<string, Promise<T>>();
  private maintenanceTail: Promise<void> = Promise.resolve();
  private maintenancePending = 0;

  constructor(private readonly options: BrowserTurnRunnerOptions) {
    if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent < 1) {
      throw new Error("Browser turn capacity must be a positive integer");
    }
  }

  run(key: string, action: () => Promise<T>): Promise<T> {
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

  enqueueMaintenance<T>(name: string, action: () => Promise<T>): Promise<T> {
    this.maintenancePending += 1;
    const operation = this.maintenanceTail.then(() => {
      if (this.active.size > 0) {
        throw new Error(`${this.options.label} ${name} requires all browser turns to finish`);
      }
      return action();
    });
    this.maintenanceTail = operation.then(() => undefined, () => undefined);
    return operation.finally(() => {
      this.maintenancePending -= 1;
    });
  }

  async close(): Promise<void> {
    await Promise.allSettled([...this.active.values()]);
    await this.maintenanceTail;
  }
}
