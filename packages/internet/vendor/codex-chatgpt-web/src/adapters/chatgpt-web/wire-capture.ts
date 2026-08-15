import type { Page, Response } from "playwright-core";
import { isChatGptSearchToolPayload } from "./tool-payload";
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
  private readonly result: Promise<string | undefined>;
  private resolveResult!: (value: string | undefined) => void;
  private settled = false;

  constructor(page: Page) {
    this.page = page;
    this.result = new Promise(resolve => {
      this.resolveResult = resolve;
    });
    page.on("response", this.onResponse);
  }

  async waitForText(timeoutMs = 1_500): Promise<string | undefined> {
    return Promise.race([
      this.result,
      new Promise<undefined>(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }

  dispose(): void {
    this.page.off("response", this.onResponse);
    this.settle(undefined);
  }

  private readonly onResponse = (response: Response): void => {
    if (!isConversationResponse(response)) return;
    void response.text()
      .then(parseChatGptWireResponse)
      .then(text => {
        if (text && !isChatGptSearchToolPayload(text)) this.settle(text);
      })
      .catch(() => undefined);
  };

  private settle(value: string | undefined): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(value);
  }
}
