import type { Page, Response } from "playwright-core";

export interface BrowserResponseCaptureOptions<T> {
  matches: (response: Response) => boolean;
  parse: (response: Response) => Promise<T | undefined>;
}

export interface BrowserResponseWaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Captures provider-selected page responses while owning listener lifecycle and waiting. */
export class BrowserResponseCapture<T> {
  private readonly errors: unknown[] = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly waiters = new Set<() => void>();
  private latestValue?: T;
  private disposed = false;
  private readonly page: Page;
  private readonly options: BrowserResponseCaptureOptions<T>;

  constructor(page: Page, options: BrowserResponseCaptureOptions<T>) {
    this.page = page;
    this.options = options;
    page.on("response", this.onResponse);
  }

  async waitForValue(options: BrowserResponseWaitOptions = {}): Promise<T | undefined> {
    const timeoutMs = options.timeoutMs ?? 1_500;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new Error("Browser response wait timeout must be a non-negative finite number");
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.latestValue !== undefined) return this.latestValue;
      throwIfAborted(options.signal);
      if ((this.disposed && this.pending.size === 0) || Date.now() >= deadline) break;
      const changed = await this.waitForChange(Math.max(0, deadline - Date.now()), options.signal);
      if (!changed) break;
    }
    if (this.latestValue !== undefined) return this.latestValue;
    if (this.errors.length > 0) {
      throw new AggregateError(this.errors, `${this.errors.length} browser response(s) failed to parse`);
    }
    return undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.page.off("response", this.onResponse);
    this.notifyWaiters();
  }

  private waitForChange(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (changed: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.waiters.delete(onChange);
        resolve(changed);
      };
      const onChange = (): void => finish(true);
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.waiters.delete(onChange);
        reject(abortReason(signal));
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.waiters.add(onChange);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  private notifyWaiters(): void {
    for (const notify of [...this.waiters]) notify();
  }

  private readonly onResponse = (response: Response): void => {
    if (this.disposed || !this.options.matches(response)) return;
    let pending!: Promise<void>;
    pending = this.options.parse(response)
      .then(value => {
        if (value !== undefined) this.latestValue = value;
      })
      .catch(error => {
        this.errors.push(error);
      })
      .finally(() => {
        this.pending.delete(pending);
        this.notifyWaiters();
      });
    this.pending.add(pending);
  };
}

function abortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("Browser response wait aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}
