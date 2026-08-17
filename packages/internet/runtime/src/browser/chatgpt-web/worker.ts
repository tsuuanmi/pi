import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "playwright-core";
import { BrowserSession } from "#runtime/browser/session";
import { BrowserTurnRunner } from "#runtime/browser/turn";
import { expandUserPath, getConfigDir } from "#runtime/core/config";
import {
  ChatGptBrowserInteractions,
} from "#runtime/browser/chatgpt-web/interactions";
import { loginVerificationMarkerPath } from "#runtime/browser/chatgpt-web/login";
import {
  detectChatGptAccountCapabilities,
  MAX_CHATGPT_BROWSER_TABS,
} from "#runtime/browser/chatgpt-web/session";
import {
  type BrowserTurn,
  ChatGptTurnDriver,
} from "#runtime/browser/chatgpt-web/turn-driver";
import { CONVERSATION_CANARY_PROMPT, validateConversationCanary } from "#runtime/providers/chatgpt-web/conversation/canary";
import {
  defaultChromeExecutable,
  DEFAULT_CONNECTOR_NAME,
} from "#runtime/providers/chatgpt-web/lifecycle/config";
import {
  CHATGPT_WEB_MODEL_ID,
  resolveChatGptWebModelMode,
  type ChatGptWebCapabilities,
} from "#runtime/providers/chatgpt-web/models/model";
import type { ChatGptWebProviderConfig as ProviderConfig } from "#runtime/providers/chatgpt-web/lifecycle/config";

const workers = new Map<string, ChatGptBrowserWorker>();
const CHATGPT_SMOKE_TEXT = "Reply with exactly: CODEX WEB GPT READY";
const CHATGPT_SMOKE_EXPECTED = "CODEX WEB GPT READY";

export interface ResolvedBrowserConfig {
  appName: string;
  storageStatePath: string;
  chromeExecutablePath: string;
  turnTimeoutMs?: number;
  headed: boolean;
  browserWindowWidth: number;
  browserWindowHeight: number;
  browserWindowPositionX: number;
  browserWindowPositionY: number;
  autoApproveToolCalls: boolean;
}

export async function closeChatGptBrowserWorkers(): Promise<void> {
  const active = [...workers.values()];
  workers.clear();
  const results = await Promise.allSettled(active.map(worker => worker.close()));
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(result => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} ChatGPT browser worker(s) failed to close`);
  }
}

export function resolveBrowserConfig(provider: ProviderConfig): ResolvedBrowserConfig {
  const configured = provider.chatgptWeb ?? {};
  const appName = configured.appName?.trim() || DEFAULT_CONNECTOR_NAME;
  const turnTimeoutMs = configured.turnTimeoutMs;
  if (turnTimeoutMs !== undefined && (!Number.isFinite(turnTimeoutMs) || turnTimeoutMs <= 0)) {
    throw new Error("ChatGPT Web turnTimeoutMs must be a positive finite number");
  }
  return {
    appName,
    storageStatePath: resolve(expandUserPath(configured.storageStatePath?.trim() || join(getConfigDir(), "browser", "storage-state.json"))),
    chromeExecutablePath: resolve(expandUserPath(configured.chromeExecutablePath?.trim() || defaultChromeExecutable())),
    ...(turnTimeoutMs !== undefined ? { turnTimeoutMs } : {}),
    headed: configured.headed !== false,
    browserWindowWidth: configured.browserWindowWidth ?? 700,
    browserWindowHeight: configured.browserWindowHeight ?? 500,
    browserWindowPositionX: configured.browserWindowPositionX ?? 0,
    browserWindowPositionY: configured.browserWindowPositionY ?? 0,
    autoApproveToolCalls: configured.autoApproveToolCalls === true,
  };
}

export class ChatGptBrowserWorker {
  static forProvider(provider: ProviderConfig): ChatGptBrowserWorker {
    const config = resolveBrowserConfig(provider);
    const key = JSON.stringify(config);
    let worker = workers.get(key);
    if (!worker) {
      worker = new ChatGptBrowserWorker(config);
      workers.set(key, worker);
    }
    return worker;
  }

  private readonly session: BrowserSession;
  private readonly turns = new BrowserTurnRunner<string>({
    maxConcurrent: MAX_CHATGPT_BROWSER_TABS,
    label: "ChatGPT Web",
  });
  private readonly interactions: ChatGptBrowserInteractions;
  private readonly driver: ChatGptTurnDriver;
  private readonly config: ResolvedBrowserConfig;

  private constructor(config: ResolvedBrowserConfig) {
    this.config = config;
    this.interactions = new ChatGptBrowserInteractions(config);
    this.session = new BrowserSession({
      executablePath: config.chromeExecutablePath,
      storageStatePath: config.storageStatePath,
      viewport: { width: config.browserWindowWidth, height: config.browserWindowHeight },
      headless: !config.headed,
      args: config.headed
        ? [
          `--window-size=${config.browserWindowWidth},${config.browserWindowHeight}`,
          `--window-position=${config.browserWindowPositionX},${config.browserWindowPositionY}`,
        ]
        : [],
      assertReady: () => this.assertBrowserReady(),
    });
    this.driver = new ChatGptTurnDriver(config, this.session, this.interactions);
  }

  run(turn: BrowserTurn): Promise<string> {
    return this.turns.run(turn.traceId, () => this.driver.run(turn));
  }

  verifyConnector(): Promise<string> {
    return this.enqueueMaintenance(() => this.verifyConnectorExclusive());
  }

  inspectSession(detectCapabilities: boolean): Promise<{
    authenticated: true;
    url: string;
    proAvailable?: boolean;
  }> {
    return this.enqueueMaintenance(() => this.inspectSessionExclusive(detectCapabilities));
  }

  smokeTest(abortSignal?: AbortSignal): Promise<{ effort: string; response: string }> {
    return this.enqueueMaintenance(() => this.smokeTestExclusive(abortSignal));
  }

  conversationCanary(abortSignal?: AbortSignal): Promise<{ conversationUrl: string; response: string }> {
    return this.enqueueMaintenance(() => this.conversationCanaryExclusive(abortSignal));
  }

  async close(): Promise<void> {
    await this.turns.close();
    await this.session.close();
  }

  private assertBrowserReady(): void {
    if (!existsSync(this.config.storageStatePath) || !existsSync(loginVerificationMarkerPath(this.config.storageStatePath))) {
      throw new Error(`ChatGPT web login state is missing: ${this.config.storageStatePath}`);
    }
    if (!existsSync(this.config.chromeExecutablePath)) {
      throw new Error(`Configured Chrome executable does not exist: ${this.config.chromeExecutablePath}`);
    }
  }

  private enqueueMaintenance<T>(action: () => Promise<T>): Promise<T> {
    return this.turns.enqueueMaintenance(action);
  }

  private async verifyConnectorExclusive(): Promise<string> {
    const page = await this.session.ensurePage();
    await this.interactions.prepareChatGptHomeSurface(page);
    await this.interactions.selectConnector(page);
    return this.config.appName;
  }

  private async inspectSessionExclusive(detectCapabilities: boolean): Promise<{
    authenticated: true;
    url: string;
    proAvailable?: boolean;
  }> {
    const page = await this.session.ensurePage();
    await this.interactions.prepareChatGptHomeSurface(page);
    const url = page.url();
    if (!detectCapabilities) return { authenticated: true, url };
    const capabilities = await detectChatGptAccountCapabilities(page);
    return { authenticated: true, url, ...capabilities };
  }

  private async conversationCanaryExclusive(
    abortSignal?: AbortSignal,
  ): Promise<{ conversationUrl: string; response: string }> {
    const threadId = `canary-${Date.now()}`;
    let conversationUrl = "";
    let submittedPage: Page | undefined;
    const response = await this.driver.run({
      traceId: `conversation-canary-${Date.now()}`,
      modelId: CHATGPT_WEB_MODEL_ID,
      conversation: {
        threadId,
        kind: "create",
        onClickAttempt: () => {},
        onConversationReady: (url, _assistantText, page) => {
          conversationUrl = url;
          submittedPage = page;
        },
        onConflict: () => {},
      },
      capabilities: { localToolsEnabled: false, proAvailable: false },
      prepare: async () => ({
        text: CONVERSATION_CANARY_PROMPT,
        images: [],
        toolCalls: [],
        release: () => {},
      }),
      abortSignal,
      onTextDelta: () => {},
    });
    conversationUrl = validateConversationCanary(response, conversationUrl);
    if (!submittedPage || submittedPage.isClosed()) {
      throw new Error("Durable conversation canary lost its submitted page before reopen verification");
    }
    await submittedPage.close();
    await this.session.closePage(threadId);
    const lease = await this.session.acquirePage(threadId, MAX_CHATGPT_BROWSER_TABS);
    let discard = false;
    try {
      await this.interactions.prepareConversationSurface(lease.page, {
        threadId,
        kind: "continue",
        conversationUrl,
        onClickAttempt: () => {},
        onConversationReady: () => {},
        onConflict: () => {},
      });
    } catch (error) {
      discard = true;
      throw error;
    } finally {
      await lease.release({ discard });
    }
    return { conversationUrl, response };
  }

  private async smokeTestExclusive(abortSignal?: AbortSignal): Promise<{ effort: string; response: string }> {
    const page = await this.session.ensurePage();
    await this.interactions.prepareChatGptHomeSurface(page);
    const account = await detectChatGptAccountCapabilities(page);
    const capabilities: ChatGptWebCapabilities = { ...account, localToolsEnabled: false };
    const modelId = CHATGPT_WEB_MODEL_ID;
    const reasoning = "high";
    const mode = resolveChatGptWebModelMode(modelId, reasoning, capabilities);
    const response = await this.driver.run({
      traceId: `smoke_${randomUUID().replaceAll("-", "")}`,
      modelId,
      reasoning,
      capabilities,
      conversation: {
        threadId: `smoke_${randomUUID().replaceAll("-", "")}`,
        kind: "create",
        onClickAttempt: () => {},
        onConversationReady: () => {},
        onConflict: () => {},
      },
      prepare: async () => ({ text: CHATGPT_SMOKE_TEXT, images: [], release: () => {} }),
      abortSignal,
      onTextDelta: () => {},
    }, page);
    if (response.trim() !== CHATGPT_SMOKE_EXPECTED) {
      throw new Error(
        `ChatGPT smoke test returned an unexpected answer (${JSON.stringify(response.trim().slice(0, 200))})`,
      );
    }
    return { effort: mode.displayLabel, response: CHATGPT_SMOKE_EXPECTED };
  }
}
