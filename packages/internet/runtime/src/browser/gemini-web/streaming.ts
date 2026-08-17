import {
  geminiResponseDomSnapshot,
  type GeminiResponseDomSnapshot,
} from "#runtime/browser/gemini-web/completion";

export type { GeminiResponseDomSnapshot } from "#runtime/browser/gemini-web/completion";
import type { Page } from "playwright-core";

import { GEMINI_RESPONSE_SELECTOR } from "#runtime/browser/gemini-web/session";

export class GeminiDomDivergenceError extends Error {
  readonly emittedPrefix: string;
  readonly renderedText: string;

  constructor(emittedPrefix: string, renderedText: string) {
    super("Gemini response DOM diverged from the already emitted stable prefix");
    this.name = "GeminiDomDivergenceError";
    this.emittedPrefix = emittedPrefix;
    this.renderedText = renderedText;
  }
}

export class GeminiCompletionQuarantinedError extends Error {
  constructor(cause: GeminiDomDivergenceError) {
    super("Gemini response was quarantined after an irreconcilable DOM change", { cause });
    this.name = "GeminiCompletionQuarantinedError";
  }
}

function commonPrefix(left: string, right: string): string {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return left.slice(0, index);
}

export class StrictGeminiStablePrefixStream {
  #emitted = "";
  #previous = "";

  get prefix(): string {
    return this.#emitted;
  }

  observe(currentText: string): string {
    const stable = commonPrefix(this.#previous, currentText);
    this.#previous = currentText;
    const newline = stable.lastIndexOf("\n");
    const safePrefix = newline >= 0 ? stable.slice(0, newline + 1) : "";
    if (!safePrefix.startsWith(this.#emitted)) {
      throw new GeminiDomDivergenceError(this.#emitted, currentText);
    }
    const delta = safePrefix.slice(this.#emitted.length);
    this.#emitted = safePrefix;
    return delta;
  }

  finish(currentText: string): string {
    if (!currentText.startsWith(this.#emitted)) {
      throw new GeminiDomDivergenceError(this.#emitted, currentText);
    }
    const delta = currentText.slice(this.#emitted.length);
    this.#emitted = currentText;
    this.#previous = currentText;
    return delta;
  }
}

export interface GeminiStreamingOptions {
  read: () => Promise<GeminiResponseDomSnapshot>;
  emitTextDelta?: (delta: string) => void | Promise<void>;
  onQuarantine?: (error: GeminiDomDivergenceError) => void | Promise<void>;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollMs?: number;
  stableMs?: number;
  minimumResponseCount?: number;
}

export interface GeminiStreamingResult {
  text: string;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Gemini turn aborted");
}

async function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const complete = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Gemini turn aborted"));
    };
    timer = setTimeout(complete, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function waitForGeminiDomCompletion(options: GeminiStreamingOptions): Promise<GeminiStreamingResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 100;
  const stableMs = options.stableMs ?? 2_000;
  const prefix = new StrictGeminiStablePrefixStream();
  const deadline = Date.now() + timeoutMs;
  let candidate: string | undefined;
  let stableSince: number | undefined;

  while (Date.now() < deadline) {
    throwIfAborted(options.signal);
    const snapshot = await options.read();
    if (snapshot.responsePresent && snapshot.currentText.trim()) {
      let delta: string;
      try {
        delta = prefix.observe(snapshot.currentText);
      } catch (error) {
        if (!(error instanceof GeminiDomDivergenceError)) throw error;
        await options.onQuarantine?.(error);
        throw new GeminiCompletionQuarantinedError(error);
      }
      if (delta) await options.emitTextDelta?.(delta);
      const complete = !snapshot.running;
      if (complete && snapshot.currentText === candidate) {
        stableSince ??= Date.now();
        if (Date.now() - stableSince >= stableMs) {
          const finalDelta = prefix.finish(snapshot.currentText);
          if (finalDelta) await options.emitTextDelta?.(finalDelta);
          return { text: prefix.prefix };
        }
      } else {
        stableSince = undefined;
      }
      candidate = snapshot.currentText;
    } else {
      candidate = undefined;
      stableSince = undefined;
    }
    await delay(pollMs, options.signal);
  }
  throw new Error(`Gemini response did not complete within ${timeoutMs}ms`);
}

export async function waitForGeminiPageDomCompletion(
  page: Page,
  options: Omit<GeminiStreamingOptions, "read"> = {},
): Promise<GeminiStreamingResult> {
  const minimumResponseCount = options.minimumResponseCount ?? 0;
  return waitForGeminiDomCompletion({
    ...options,
    read: async () => {
      const responseCount = await page.locator(GEMINI_RESPONSE_SELECTOR).count();
      if (responseCount <= minimumResponseCount) {
        return { responsePresent: false, currentText: "", currentHtml: "", running: true };
      }
      return geminiResponseDomSnapshot(page);
    },
  });
}
