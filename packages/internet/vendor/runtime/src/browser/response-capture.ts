import type { Page, Response } from "playwright-core";

export interface BrowserResponseCaptureOptions<T> {
  matches: (response: Response) => boolean;
  parse: (response: Response) => Promise<T>;
}

/** Captures provider-selected page responses while owning listener lifecycle and waiting. */
export class BrowserResponseCapture<T> {
  private readonly captured: Array<T | undefined> = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly page: Page,
    private readonly options: BrowserResponseCaptureOptions<T>,
  ) {
    page.on("response", this.onResponse);
  }

  async waitForValue(timeoutMs = 1_500): Promise<T | undefined> {
    const pending = [...this.pending];
    if (pending.length > 0) {
      await Promise.race([
        Promise.all(pending),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ]);
    }
    return this.captured.filter((value): value is T => value !== undefined).at(-1);
  }

  dispose(): void {
    this.page.off("response", this.onResponse);
  }

  private readonly onResponse = (response: Response): void => {
    if (!this.options.matches(response)) return;
    const index = this.captured.length;
    this.captured.push(undefined);
    let pending!: Promise<void>;
    pending = this.options.parse(response)
      .then(value => {
        this.captured[index] = value;
      })
      .catch(() => undefined)
      .finally(() => {
        this.pending.delete(pending);
      });
    this.pending.add(pending);
  };
}
