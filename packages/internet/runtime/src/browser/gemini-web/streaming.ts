import {
  geminiResponseDomSnapshot,
  type GeminiResponseDomSnapshot,
} from "#runtime/browser/gemini-web/completion";

export type { GeminiResponseDomSnapshot } from "#runtime/browser/gemini-web/completion";
import type { Page } from "playwright-core";

import { GEMINI_RESPONSE_SELECTOR } from "#runtime/browser/gemini-web/session";

export interface GeminiStreamingOptions {
  read: () => Promise<GeminiResponseDomSnapshot>;
  emitTextDelta?: (delta: string) => void | Promise<void>;
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
  const deadline = Date.now() + timeoutMs;
  let candidate: string | undefined;
  let stableSince: number | undefined;

  while (Date.now() < deadline) {
    throwIfAborted(options.signal);
    const snapshot = await options.read();
    if (snapshot.responsePresent && snapshot.currentText.trim()) {
      const complete = !snapshot.running;
      if (complete && snapshot.currentText === candidate) {
        stableSince ??= Date.now();
        if (Date.now() - stableSince >= stableMs) {
          await options.emitTextDelta?.(snapshot.currentText);
          return { text: snapshot.currentText };
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
