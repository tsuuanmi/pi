import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { parseGeminiConversationUrl } from "#runtime/browser/gemini-web/session";
import { atomicWriteFile } from "#runtime/core/config";

export interface GeminiNativeConversationState {
  version: 1;
  provider: "gemini-web";
  sessionHash: string;
  url: string;
  updatedAt: string;
}

export interface GeminiConversationPolicyOptions {
  conversationStateDir: string;
}

function sessionHash(sessionId: string): string {
  if (!sessionId.trim() || sessionId.length > 512) throw new Error("Pi session identity is invalid");
  return createHash("sha256").update(sessionId).digest("hex");
}

function stateName(sessionId: string): string {
  return `${sessionHash(sessionId)}.json`;
}

function validateState(value: unknown, sessionId: string): GeminiNativeConversationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini conversation state must be an object");
  }
  const state = value as Record<string, unknown>;
  if (state.version !== 1 || state.provider !== "gemini-web" || state.sessionHash !== sessionHash(sessionId)) {
    throw new Error("Gemini conversation state does not match the Pi session");
  }
  if (typeof state.url !== "string") throw new Error("Gemini conversation state is missing its URL");
  const url = parseGeminiConversationUrl(state.url);
  if (!url) throw new Error("Gemini conversation state has an unsafe URL");
  if (typeof state.updatedAt !== "string" || !state.updatedAt.trim()) {
    throw new Error("Gemini conversation state is missing updatedAt");
  }
  return { version: 1, provider: "gemini-web", sessionHash: sessionHash(sessionId), url, updatedAt: state.updatedAt };
}

export class GeminiNativeConversationPolicy {
  readonly #stateDir: string;

  constructor(options: GeminiConversationPolicyOptions) {
    if (!isAbsolute(options.conversationStateDir)) throw new Error("Gemini conversationStateDir must be absolute");
    this.#stateDir = resolve(options.conversationStateDir);
  }

  #path(sessionId: string): string {
    return join(this.#stateDir, stateName(sessionId));
  }

  resolve(sessionId: string): string | undefined {
    try {
      return validateState(JSON.parse(readFileSync(this.#path(sessionId), "utf8")), sessionId).url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  record(sessionId: string, url: string): void {
    const safeUrl = parseGeminiConversationUrl(url);
    if (!safeUrl) throw new Error("Gemini returned an unsafe conversation URL");
    const existing = this.resolve(sessionId);
    if (existing && existing !== safeUrl) {
      throw new Error("Gemini chat identity changed for the Pi session");
    }
    if (existing) return;
    const currentStateName = stateName(sessionId);
    let stateNames: string[] = [];
    try {
      stateNames = readdirSync(this.#stateDir, { encoding: "utf8" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const name of stateNames) {
      if (name === currentStateName || !name.endsWith(".json")) continue;
      const state = JSON.parse(readFileSync(resolve(this.#stateDir, name), "utf8")) as Partial<GeminiNativeConversationState>;
      if (state.version === 1 && state.provider === "gemini-web" && state.url === safeUrl) {
        throw new Error("Gemini conversation identity is already bound to another Pi session");
      }
    }
    const state: GeminiNativeConversationState = {
      version: 1,
      provider: "gemini-web",
      sessionHash: sessionHash(sessionId),
      url: safeUrl,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteFile(this.#path(sessionId), `${JSON.stringify(state, null, 2)}\n`);
  }
}
