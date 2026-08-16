import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { atomicWriteFile, getConfigDir } from "#runtime/core/config";
import {
  CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_EFFORT_CONTROL_SELECTOR,
  CHATGPT_EFFORT_ITEM_SELECTOR,
} from "#runtime/browser/chatgpt-web/session";

export function redactChatGptUiDiagnostic(value: string): string {
  return value
    .replace(/<codex_context_json>[\s\S]*?<\/codex_context_json>/gi, "<codex_context_json>[redacted]</codex_context_json>")
    .replace(/\b(turn|binding|call)_[A-Za-z0-9_-]{12,}\b/g, "$1_[redacted]");
}

const CHATGPT_BROWSER_DIAGNOSTIC_TRACE_LIMIT = 10;

export function browserDiagnosticCheckpoint(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return safe || "checkpoint";
}

export function browserDiagnosticIncludesScreenshot(
  checkpoint: string,
  captureAll = process.env.PI_INTERNET_RUNTIME_BROWSER_DIAGNOSTICS === "1",
): boolean {
  return captureAll || checkpoint === "response-stalled-30s" || checkpoint === "turn-failed";
}

function privateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  try { chmodSync(path, 0o700); } catch { /* Windows ACLs are managed by the installer. */ }
}

function pruneBrowserDiagnostics(root: string): void {
  const traces = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[A-Za-z0-9_-]{6,128}$/.test(entry.name))
    .map(entry => {
      const path = join(root, entry.name);
      return { path, modifiedAt: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const trace of traces.slice(CHATGPT_BROWSER_DIAGNOSTIC_TRACE_LIMIT)) {
    rmSync(trace.path, { recursive: true, force: true });
  }
}

export class ChatGptBrowserDiagnostics {
  private readonly root = join(getConfigDir(), "diagnostics", "browser-turns");
  private readonly directory: string;
  private sequence = 0;
  private initialized = false;
  private readonly traceId: string;

  constructor(traceId: string) {
    this.traceId = traceId;
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(traceId)) {
      throw new Error("ChatGPT browser diagnostic trace id is invalid");
    }
    this.directory = join(this.root, `${traceId}-${randomUUID().slice(0, 8)}`);
  }

  async capture(page: Page, checkpoint: string, error?: unknown): Promise<void> {
    try {
      if (!this.initialized) {
        privateDirectory(this.root);
        privateDirectory(this.directory);
        pruneBrowserDiagnostics(this.root);
        this.initialized = true;
      }
      const sequence = String(++this.sequence).padStart(2, "0");
      const stem = `${sequence}-${browserDiagnosticCheckpoint(checkpoint)}`;
      const includeScreenshot = browserDiagnosticIncludesScreenshot(checkpoint);
      const [screenshot, state] = await Promise.all([
        includeScreenshot
          ? page.screenshot({ animations: "disabled", caret: "hide", timeout: 5_000, type: "png" })
          : Promise.resolve(undefined),
        page.evaluate(({ composerSelector, effortControlSelector, effortItemSelector, assistantTurnSelector }) => {
          const rendered = (element: Element): boolean => {
            const candidate = element as HTMLElement;
            const style = getComputedStyle(candidate);
            return candidate.isConnected
              && style.display !== "none"
              && style.visibility !== "hidden"
              && style.opacity !== "0";
          };

          const boundedText = (element: Element): string => (
            ((element as HTMLElement).innerText || element.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 1_000)
          );
          const rows = (selector: string, limit = 40) => [...document.querySelectorAll(selector)]
            .filter(rendered)
            .slice(-limit)
            .map(element => ({
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role"),
              testId: element.getAttribute("data-testid"),
              ariaExpanded: element.getAttribute("aria-expanded"),
              ariaChecked: element.getAttribute("aria-checked"),
              dataState: element.getAttribute("data-state"),
              text: boundedText(element),
            }));
          const composers = [...document.querySelectorAll(composerSelector)].filter(rendered);
          const assistantTurns = [...document.querySelectorAll(assistantTurnSelector)].filter(rendered);
          return {
            url: location.href,
            title: document.title,
            surfaceId: (globalThis as typeof globalThis & { __CODEX_WEB_GPT_SURFACE_ID__?: unknown })
              .__CODEX_WEB_GPT_SURFACE_ID__ ?? null,
            bodyTextChars: document.body?.innerText.length ?? 0,
            composer: {
              visibleCount: composers.length,
              textChars: composers.map(element => (element.textContent ?? "").length),
              selectedConnectors: rows('[data-id^="plugin:"][data-keyword]', 20),
            },
            effortControls: rows(effortControlSelector, 10),
            effortItems: rows(effortItemSelector, 20),
            menus: rows('[role="menu"], [role="listbox"], [data-testid="composer-intelligence-picker-content"]', 20),
            connectorRows: rows('.__menu-item[tabindex="0"]', 40),
            overlays: rows('[role="dialog"], [role="alert"], [role="status"]', 30),
            turns: {
              user: document.querySelectorAll('[data-testid^="conversation-turn-"][data-message-author-role="user"]').length,
              assistant: assistantTurns.map(element => ({
                textChars: (element.textContent ?? "").length,
                htmlChars: (element as HTMLElement).innerHTML.length,
              })),
            },
          };
        }, {
          composerSelector: CHATGPT_COMPOSER_SELECTOR,
          effortControlSelector: CHATGPT_EFFORT_CONTROL_SELECTOR,
          effortItemSelector: CHATGPT_EFFORT_ITEM_SELECTOR,
          assistantTurnSelector: CHATGPT_ASSISTANT_TURN_SELECTOR,
        }),
      ]);
      const capturedAt = new Date().toISOString();
      if (screenshot) atomicWriteFile(join(this.directory, `${stem}.png`), screenshot);
      atomicWriteFile(join(this.directory, `${stem}.json`), `${JSON.stringify({
        version: 1,
        capturedAt,
        traceId: this.traceId,
        checkpoint,
        ...(error !== undefined ? {
          error: redactChatGptUiDiagnostic(error instanceof Error ? error.message : String(error)),
        } : {}),
        state,
      }, null, 2)}\n`);
      console.info(`[chatgpt-web] browser diagnostic trace=${this.traceId} checkpoint=${stem} path=${this.directory}`);
    } catch (captureError) {
      console.warn(
        `[chatgpt-web] browser diagnostic capture failed trace=${this.traceId}`
        + ` checkpoint=${browserDiagnosticCheckpoint(checkpoint)}:`
        + ` ${captureError instanceof Error ? captureError.message : String(captureError)}`,
      );
    }
  }
}
