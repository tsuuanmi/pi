import type { Page, Response } from "playwright-core";
import { parseChatGptWireResponse } from "./wire-response";

function isConversationResponse(response: Response): boolean {
  if (response.request().method() !== "POST") return false;
  try {
    const url = new URL(response.url());
    return url.hostname === "chatgpt.com"
      && url.pathname.startsWith("/backend-api/")
      && url.pathname.includes("conversation");
  } catch {
    return false;
  }
}

export class ChatGptWireCapture {
  private readonly page: Page;
  private readonly captured: Array<string | undefined> = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(page: Page) {
    this.page = page;
    page.on("response", this.onResponse);
  }

  async waitForText(timeoutMs = 1_500): Promise<string | undefined> {
    const pending = [...this.pending];
    if (pending.length > 0) {
      await Promise.race([
        Promise.all(pending),
        new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
      ]);
    }
    return this.captured.filter((text): text is string => Boolean(text)).at(-1);
  }

  dispose(): void {
    this.page.off("response", this.onResponse);
  }

  private readonly onResponse = (response: Response): void => {
    if (!isConversationResponse(response)) return;
    const index = this.captured.length;
    this.captured.push(undefined);
    let pending!: Promise<void>;
    pending = response.text()
      .then(parseChatGptWireResponse)
      .then(text => {
        this.captured[index] = text;
      })
      .catch(() => undefined)
      .finally(() => {
        this.pending.delete(pending);
      });
    this.pending.add(pending);
  };
}
