import { chromium, type LaunchOptions } from "playwright-core";

import { BrowserSession } from "#runtime/browser/session";
import { BrowserTurnRunner, runBrowserStage } from "#runtime/browser/turn";
import type { GeminiWebBrowserConfig } from "#runtime/browser/gemini-web/config";
import { waitForGeminiPageDomCompletion, type GeminiDomDivergenceError } from "#runtime/browser/gemini-web/streaming";
import {
  fillGeminiComposer,
  prepareGeminiConversationSurface,
  selectGeminiModel,
  sendGeminiMessage,
  stopGeminiResponse,
} from "#runtime/browser/gemini-web/interactions";
import { GEMINI_RESPONSE_SELECTOR, parseGeminiConversationUrl } from "#runtime/browser/gemini-web/session";
export interface GeminiBrowserModel {
  id: string;
  label: string;
}

export interface GeminiBrowserTurnRequest {
  prompt: string;
  continuationPrompt: string;
  model: GeminiBrowserModel;
  resolveConversationUrl?: () => string | undefined;
  requireExistingConversation?: boolean;
  recordConversationUrl?: (conversationUrl: string) => void;
  traceId: string;
  signal?: AbortSignal;
  onTextDelta: (delta: string) => void | Promise<void>;
  onQuarantine?: (error: GeminiDomDivergenceError) => void | Promise<void>;
}

export interface GeminiBrowserTurnResult {
  text: string;
  conversationUrl: string;
}

export interface GeminiWebTurnDriverOptions {
  browser: GeminiWebBrowserConfig;
  session?: BrowserSession;
  turnTimeoutMs?: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Gemini turn aborted");
}

function createSession(config: GeminiWebBrowserConfig): BrowserSession {
  const launch = (options: LaunchOptions) => chromium.launch(options);
  return new BrowserSession(
    {
      executablePath: config.chromeExecutablePath,
      storageStatePath: config.storageStatePath,
      viewport: {
        width: config.browserWindowWidth ?? 700,
        height: config.browserWindowHeight ?? 500,
      },
      headless: config.headed !== true,
      args: [
        `--window-position=${config.browserWindowPositionX ?? 0},${config.browserWindowPositionY ?? 0}`,
        `--window-size=${config.browserWindowWidth ?? 700},${config.browserWindowHeight ?? 500}`,
      ],
      assertReady: () => {},
    },
    launch,
  );
}

export class GeminiWebTurnDriver {
  readonly #runner = new BrowserTurnRunner<GeminiBrowserTurnResult>({ maxConcurrent: 1, label: "gemini-web" });
  readonly #config: GeminiWebBrowserConfig;
  readonly #turnTimeoutMs: number;
  #session: BrowserSession;

  constructor(options: GeminiWebTurnDriverOptions) {
    this.#config = options.browser;
    this.#turnTimeoutMs = options.turnTimeoutMs ?? options.browser.turnTimeoutMs ?? 120_000;
    this.#session = options.session ?? createSession(options.browser);
  }

  get activeTurnCount(): number {
    return this.#runner.activeCount;
  }

  async run(request: GeminiBrowserTurnRequest): Promise<GeminiBrowserTurnResult> {
    return this.#runner.run(request.traceId, async () => this.runExclusive(request));
  }

  private async stage<T>(traceId: string, label: string, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return runBrowserStage({ label, traceId, stage: "interaction", timeoutMs: this.#turnTimeoutMs, action });
  }

  private async runExclusive(request: GeminiBrowserTurnRequest): Promise<GeminiBrowserTurnResult> {
    throwIfAborted(request.signal);
    const conversationUrl = request.resolveConversationUrl?.();
    if (request.requireExistingConversation && !conversationUrl) {
      throw new Error("Gemini Web continuation state is missing for this Pi session");
    }
    const page = await this.#session.ensurePage();
    await this.stage(request.traceId, "conversation", async signal => {
      throwIfAborted(signal);
      throwIfAborted(request.signal);
      await prepareGeminiConversationSurface(page, conversationUrl);
    });
    await this.stage(request.traceId, "select-model", async signal => {
      throwIfAborted(signal);
      throwIfAborted(request.signal);
      await selectGeminiModel(page, request.model.label);
    });
    const minimumResponseCount = await this.stage(request.traceId, "send", async signal => {
      throwIfAborted(signal);
      throwIfAborted(request.signal);
      const count = await page.locator(GEMINI_RESPONSE_SELECTOR).count();
      await fillGeminiComposer(page, conversationUrl ? request.continuationPrompt : request.prompt);
      await sendGeminiMessage(page);
      return count;
    });
    let completion: Awaited<ReturnType<typeof waitForGeminiPageDomCompletion>>;
    try {
      completion = await this.stage(request.traceId, "capture", async signal => {
        const captureSignal = request.signal ? AbortSignal.any([signal, request.signal]) : signal;
        return waitForGeminiPageDomCompletion(page, {
          signal: captureSignal,
          timeoutMs: this.#turnTimeoutMs,
          emitTextDelta: request.onTextDelta,
          onQuarantine: request.onQuarantine,
          minimumResponseCount,
        });
      });
    } catch (error) {
      if (request.signal?.aborted) await stopGeminiResponse(page).catch(() => {});
      await this.#session.close();
      this.#session = createSession(this.#config);
      throw error;
    }
    const completedConversationUrl = parseGeminiConversationUrl(page.url());
    if (!completedConversationUrl) {
      throw new Error("Gemini did not expose a safe native conversation URL after completion");
    }
    request.recordConversationUrl?.(completedConversationUrl);
    return { text: completion.text, conversationUrl: completedConversationUrl };
  }

  async close(): Promise<void> {
    await this.#runner.close();
    await this.#session.close();
  }
}
