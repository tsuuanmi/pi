import type { Page } from "playwright-core";
import { atomicWriteFile } from "#runtime/core/config";
import type { BrowserPageLease, BrowserSession } from "#runtime/browser/session";
import { runBrowserStage } from "#runtime/browser/turn";
import { ChatGptMarkdownBuffer } from "#runtime/providers/chatgpt-web/content/markdown";
import type { CompiledChatGptWebPrompt } from "#runtime/providers/chatgpt-web/content/prompt";
import {
  estimateCompiledChatGptWebInputTokens,
  estimateCompiledChatGptWebMessageTokens,
} from "#runtime/providers/chatgpt-web/content/tokens";
import {
  resolveChatGptWebModelMode,
  type ChatGptWebCapabilities,
} from "#runtime/providers/chatgpt-web/models/model";
import {
  CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_STOP_BUTTON_SELECTOR,
  CHATGPT_USER_TURN_SELECTOR,
  MAX_CHATGPT_BROWSER_TABS,
} from "#runtime/browser/chatgpt-web/session";
import {
  assertChatGptWebInputWithinLimits,
  CHATGPT_TOOL_CONFIRMATION_TIMEOUT_MS,
  type ChatGptBrowserInteractions,
  resolveChatGptToolConfirmation,
  settleChatGptUi,
  throwIfChatGptSessionFailureAlert,
  throwIfChatGptTerminalErrorAlert,
} from "#runtime/browser/chatgpt-web/interactions";
import {
  ChatGptCompletionInspector,
  ChatGptCompletionTracker,
  ChatGptTurnDomHealthTracker,
  ChatGptVisibleTraceTracker,
} from "#runtime/browser/chatgpt-web/completion";
import { ChatGptBrowserDiagnostics } from "#runtime/browser/chatgpt-web/diagnostics";
import { ChatGptWireCapture } from "#runtime/browser/chatgpt-web/wire-capture";

export interface BrowserConversationTurn {
  threadId: string;
  kind: "create" | "continue";
  conversationUrl?: string;
  onClickAttempt: () => void;
  onConversationReady: (conversationUrl: string, assistantText: string, page: Page) => void;
  onConflict: () => void;
}

export interface BrowserTurn {
  traceId: string;
  modelId: string;
  conversation: BrowserConversationTurn;
  reasoning?: string;
  capabilities: ChatGptWebCapabilities;
  prepare: () => Promise<CompiledChatGptWebPrompt & { release: () => void }>;
  abortSignal?: AbortSignal;
  onHeartbeat?: () => void;
  onReasoningSummary?: (text: string, continuation?: boolean) => void;
  onCommentary?: (text: string, continuation?: boolean) => void;
  onTextDelta: (delta: string) => void;
}

export interface ChatGptTurnDriverConfig {
  appName: string;
  storageStatePath: string;
  turnTimeoutMs?: number;
  autoApproveToolCalls: boolean;
}

const browserStageTimeouts = {
  browserPage: 60_000,
  conversationPreparation: 60_000,
  effortSelection: 120_000,
  promptAttachment: 60_000,
  fileAttachment: 120_000,
  send: 20_000,
} as const;

export class ChatGptTurnDriver {
  private readonly completion = new ChatGptCompletionInspector();
  private readonly config: ChatGptTurnDriverConfig;
  private readonly session: BrowserSession;
  private readonly interactions: ChatGptBrowserInteractions;

  constructor(
    config: ChatGptTurnDriverConfig,
    session: BrowserSession,
    interactions: ChatGptBrowserInteractions,
  ) {
    this.config = config;
    this.session = session;
    this.interactions = interactions;
  }

  private runStage<T>(
    traceId: string,
    stage: string,
    timeoutMs: number,
    action: (abortSignal: AbortSignal) => Promise<T>,
    onTimeout?: () => Promise<void>,
  ): Promise<T> {
    return runBrowserStage({
      label: "chatgpt-web",
      traceId,
      stage,
      timeoutMs,
      action,
      ...(onTimeout ? { onTimeout } : {}),
    });
  }

  async run(turn: BrowserTurn, maintenancePage?: Page): Promise<string> {
    if (turn.abortSignal?.aborted) throw new DOMException("ChatGPT web turn aborted", "AbortError");
    const requestedMode = resolveChatGptWebModelMode(turn.modelId, turn.reasoning, turn.capabilities);
    const prepared = await turn.prepare();
    const diagnostics = new ChatGptBrowserDiagnostics(turn.traceId);
    let diagnosticPage: Page | undefined;
    let pageLease: BrowserPageLease | undefined;
    let discardPage = false;
    let wireCapture: ChatGptWireCapture | undefined;
    try {
      if (turn.abortSignal?.aborted) throw new DOMException("ChatGPT web turn aborted", "AbortError");
      const estimatedInputTokens = estimateCompiledChatGptWebInputTokens(prepared, turn.modelId);
      const estimatedMessageTokens = estimateCompiledChatGptWebMessageTokens(prepared, turn.modelId);
      assertChatGptWebInputWithinLimits(
        estimatedInputTokens,
        estimatedMessageTokens,
        turn.modelId,
        requestedMode.effort,
        turn.capabilities,
        prepared.text.length,
      );
      const deadline = this.config.turnTimeoutMs === undefined
        ? undefined
        : Date.now() + this.config.turnTimeoutMs;
      const page = await this.runStage(turn.traceId, "browser_page", browserStageTimeouts.browserPage, async (abortSignal) => {
        if (maintenancePage) return maintenancePage;
        pageLease = await this.session.acquirePage(turn.conversation.threadId, MAX_CHATGPT_BROWSER_TABS);
        if (abortSignal.aborted) {
          await pageLease.release({ discard: true });
          throw abortSignal.reason;
        }
        return pageLease.page;
      });
      diagnosticPage = page;
      const quarantinePage = async (): Promise<void> => {
        discardPage = true;
        if (!page.isClosed()) await page.close().catch(() => {});
      };
      await diagnostics.capture(page, "browser-page-acquired");
      console.info(
        `[chatgpt-web] browser turn ${turn.traceId} opened (transport=inline, promptChars=${prepared.text.length}, estimatedInputTokens=${estimatedInputTokens}, images=${prepared.images.length}, compactionTrimmedMessages=${prepared.trimmedCompactionMessages ?? 0})`,
      );
      await this.runStage(
        turn.traceId,
        "conversation_preparation",
        browserStageTimeouts.conversationPreparation,
        () => this.interactions.prepareConversationSurface(page, turn.conversation, checkpoint => diagnostics.capture(page, checkpoint)),
        quarantinePage,
      );
      const mode = await this.runStage(turn.traceId, "effort_selection", browserStageTimeouts.effortSelection, () => (
        this.interactions.selectModelAndEffort(
          page,
          turn.modelId,
          turn.reasoning,
          turn.capabilities,
          checkpoint => diagnostics.capture(page, checkpoint),
        )
      ), quarantinePage);
      await diagnostics.capture(page, "effort-selection-complete");
      await this.runStage(turn.traceId, "prompt_attachment", browserStageTimeouts.promptAttachment, (stageSignal) => {
        const promptAbortSignal = turn.abortSignal
          ? AbortSignal.any([stageSignal, turn.abortSignal])
          : stageSignal;
        return this.interactions.attachPrompt(
          page,
          prepared.text,
          mode.localTools,
          checkpoint => diagnostics.capture(page, checkpoint),
          promptAbortSignal,
        );
      }, quarantinePage);
      await diagnostics.capture(page, "prompt-attachment-complete");
      await this.runStage(turn.traceId, "file_attachment", browserStageTimeouts.fileAttachment, () => (
        this.interactions.attachFiles(page, prepared)
      ), quarantinePage);
      await diagnostics.capture(page, "file-attachment-complete");
      const responseTurns = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR);
      const initialResponseTurnCount = await responseTurns.count();
      const responseTurn = responseTurns.nth(initialResponseTurnCount);
      const userTurns = page.locator(CHATGPT_USER_TURN_SELECTOR);
      const initialUserTurnCount = await userTurns.count();
      wireCapture = new ChatGptWireCapture(page);
      await this.runStage(turn.traceId, "send", browserStageTimeouts.send, async (stageSignal) => {
        const composer = await this.interactions.activeComposer(page);
        const sendButton = composer
          .locator("xpath=ancestor::form[1]")
          .getByTestId("send-button");
        await sendButton.waitFor({ state: "visible", timeout: browserStageTimeouts.send });
        if (!await sendButton.isEnabled()) {
          throw new Error("ChatGPT send button is disabled after the complete prompt was attached");
        }
        await settleChatGptUi();
        await diagnostics.capture(page, "send-ready");
        await throwIfChatGptSessionFailureAlert(page);
        turn.conversation.onClickAttempt();
        await sendButton.press("Enter");
        const evidence = await this.interactions.waitForSubmissionAccepted(
          page,
          userTurns,
          responseTurns,
          responseTurn,
          initialUserTurnCount,
          initialResponseTurnCount,
          stageSignal,
        );
        console.info(`[chatgpt-web] browser turn ${turn.traceId} submission accepted evidence=${evidence}`);
      }, quarantinePage);
      await diagnostics.capture(page, "send-accepted");

      let lastHeartbeat = 0;
      let finalText = "";
      let sawRunning = false;
      let loggedCompletionWait = false;
      let capturedResponse = false;
      const sentAt = Date.now();
      const visibleTrace = new ChatGptVisibleTraceTracker();
      const markdownBuffer = new ChatGptMarkdownBuffer();
      const completionTracker = new ChatGptCompletionTracker();
      const domHealthTracker = new ChatGptTurnDomHealthTracker();
      for (;;) {
        if (page.isClosed()) {
          throw new Error("ChatGPT browser tab was closed; the Codex turn was terminated");
        }
        if (turn.abortSignal?.aborted) {
          const stop = page.locator(CHATGPT_STOP_BUTTON_SELECTOR).last();
          if (await stop.isVisible().catch(() => false)) await stop.press("Enter").catch(() => {});
          throw new DOMException("ChatGPT web turn aborted", "AbortError");
        }
        if (deadline !== undefined && Date.now() >= deadline) {
          throw new Error("ChatGPT web turn timed out");
        }
        if (Date.now() - lastHeartbeat >= 10_000) {
          turn.onHeartbeat?.();
          lastHeartbeat = Date.now();
        }

        await throwIfChatGptSessionFailureAlert(page);
        await throwIfChatGptTerminalErrorAlert(responseTurn);

        if (mode.localTools && await resolveChatGptToolConfirmation(
          page,
          this.config.appName,
          this.config.autoApproveToolCalls,
          turn.abortSignal,
          CHATGPT_TOOL_CONFIRMATION_TIMEOUT_MS,
          () => diagnostics.capture(page, "tool-confirmation-visible"),
        )) {
          await new Promise(resolveSleep => setTimeout(resolveSleep, 250));
          continue;
        }

        const snapshot = await this.completion.responseDomSnapshot(responseTurn);
        const stop = page.locator(CHATGPT_STOP_BUTTON_SELECTOR).last();
        const running = await stop.isVisible().catch(() => false);
        if (running) sawRunning = true;
        if (snapshot.responsePresent) {
          if (!capturedResponse) {
            capturedResponse = true;
            await diagnostics.capture(page, "response-visible");
          }
          markdownBuffer.observe(snapshot.markdownSegments);
          for (const trace of visibleTrace.observe(snapshot.traceBlocks, snapshot.completionActionVisible)) {
            if (trace.kind === "commentary") turn.onCommentary?.(trace.text, trace.continuation === true);
            else turn.onReasoningSummary?.(trace.text, trace.continuation === true);
          }
          const domError = domHealthTracker.update({
            responsePresent: snapshot.responsePresent,
            running,
            currentText: snapshot.visibleText,
            completionActionVisible: snapshot.completionActionVisible,
          });
          if (domError) throw new Error(domError);
          if (completionTracker.update({
            responsePresent: snapshot.responsePresent,
            running,
            currentText: snapshot.visibleText,
            currentHtml: snapshot.fullHtml,
            completionActionVisible: snapshot.completionActionVisible,
          })) {
            if (snapshot.visibleText === "api_tool unavailable") {
              throw new Error("ChatGPT selected mode rejected the Codex Native MCP tool (api_tool unavailable)");
            }
            const wireText = await wireCapture.waitForText(1_500, turn.abortSignal);
            if (!wireText) {
              throw new Error("ChatGPT completed without an authenticated wire response");
            }
            const capturedText = wireText;
            console.info(`[chatgpt-web] browser turn ${turn.traceId} response capture=wire`);
            finalText = capturedText;
            if (finalText) turn.onTextDelta(finalText);
            break;
          }
          if (!loggedCompletionWait && Date.now() - sentAt >= 30_000) {
            loggedCompletionWait = true;
            await diagnostics.capture(page, "response-stalled-30s");
            const diagnostic = await this.completion.stalledTurnDiagnostic(page, responseTurn).catch(error => JSON.stringify({
              diagnosticError: error instanceof Error ? error.message : String(error),
            }));
            console.warn(
              `[chatgpt-web] waiting for completed-turn evidence (running=${running}, sawRunning=${sawRunning}, textChars=${snapshot.visibleText.length}, completionActionVisible=${snapshot.completionActionVisible}, ui=${diagnostic})`,
            );
          }
        } else {
          const domError = domHealthTracker.update({
            responsePresent: false,
            running,
            currentText: "",
            completionActionVisible: false,
          });
          if (domError) throw new Error(domError);
        }
        await new Promise(resolveSleep => setTimeout(resolveSleep, 250));
      }

      const state = await this.session.storageState();
      atomicWriteFile(this.config.storageStatePath, `${JSON.stringify(state)}\n`);
      await diagnostics.capture(page, "turn-completed");
      turn.conversation.onConversationReady(page.url(), finalText, page);
      console.info(`[chatgpt-web] browser turn ${turn.traceId} completed (markdownChars=${finalText.length})`);
      return finalText;
    } catch (error) {
      discardPage = true;
      turn.conversation.onConflict();
      if (diagnosticPage && !diagnosticPage.isClosed()) {
        await diagnostics.capture(diagnosticPage, "turn-failed", error);
        if (maintenancePage) await diagnosticPage.close().catch(() => {});
      }
      throw error;
    } finally {
      wireCapture?.dispose();
      await pageLease?.release({ discard: discardPage });
      prepared.release();
    }
  }
}
