import type { Page, Response } from "playwright-core";
import { BrowserResponseCapture } from "#runtime/browser/response-capture";
import { parseChatGptWireResponse } from "#runtime/providers/chatgpt-web/transport/wire-response";

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

export class ChatGptWireCapture extends BrowserResponseCapture<string | undefined> {
  constructor(page: Page) {
    super(page, {
      matches: isConversationResponse,
      parse: response => response.text().then(parseChatGptWireResponse),
    });
  }

  waitForText(timeoutMs = 1_500): Promise<string | undefined> {
    return this.waitForValue(timeoutMs);
  }
}
