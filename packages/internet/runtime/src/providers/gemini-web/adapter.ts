import type { AdapterEvent, ParsedRequest } from "#runtime/core/protocol/types";
import type { IncomingRequestMeta, RuntimeProviderAdapter } from "#runtime/core/provider";
import type { GeminiWebCapabilityMarker } from "#runtime/browser/gemini-web/capabilities";
import { GeminiWebTurnDriver } from "#runtime/browser/gemini-web/turn-driver";
import { resolveGeminiWebModelRoute } from "#runtime/providers/gemini-web/models";
import {
  compileGeminiWebContinuationPrompt,
  compileGeminiWebPrompt,
} from "#runtime/providers/gemini-web/prompt";
import { GeminiNativeConversationPolicy } from "#runtime/providers/gemini-web/conversation/policy";
import {
  validateGeminiWebProviderConfig,
  type GeminiWebProviderConfig,
} from "#runtime/providers/gemini-web/config";

export interface GeminiWebAdapterDependencies {
  driver?: GeminiWebTurnDriver;
  conversationPolicy?: GeminiNativeConversationPolicy;
}

function piSessionId(parsed: ParsedRequest): string {
  if (!parsed.sessionId?.trim()) throw new Error("Gemini Web requires a Pi session identity");
  return parsed.sessionId;
}

function textDelta(text: string): AdapterEvent {
  return { type: "text_delta", text };
}

function done(): AdapterEvent {
  return { type: "done", stopReason: "stop", endTurn: true };
}

export class GeminiWebAdapter implements RuntimeProviderAdapter<ParsedRequest> {
  readonly name = "gemini-web";
  readonly #driver: GeminiWebTurnDriver;
  readonly #conversationPolicy: GeminiNativeConversationPolicy;
  readonly #marker: GeminiWebCapabilityMarker;

  constructor(config: GeminiWebProviderConfig, dependencies: GeminiWebAdapterDependencies = {}) {
    validateGeminiWebProviderConfig(config);
    this.#marker = config.capabilityMarker.capabilities;
    this.#driver = dependencies.driver ?? new GeminiWebTurnDriver({
      browser: config.geminiWeb,
      turnTimeoutMs: config.geminiWeb.turnTimeoutMs,
    });
    this.#conversationPolicy = dependencies.conversationPolicy
      ?? new GeminiNativeConversationPolicy({ conversationStateDir: config.geminiWeb.conversationStateDir });
  }

  async runTurn(
    parsed: ParsedRequest,
    incoming: IncomingRequestMeta,
    emit: (event: AdapterEvent) => void,
  ): Promise<void> {
    // Validate and compile before the driver can acquire a browser page.
    const prompt = compileGeminiWebPrompt(parsed);
    const continuationPrompt = compileGeminiWebContinuationPrompt(parsed);
    const model = resolveGeminiWebModelRoute(parsed.modelId, this.#marker);
    const sessionId = piSessionId(parsed);
    await this.#driver.run({
      prompt: prompt.text,
      continuationPrompt: continuationPrompt.text,
      model,
      resolveConversationUrl: () => this.#conversationPolicy.resolve(sessionId),
      requireExistingConversation: parsed.previousResponseId !== undefined,
      recordConversationUrl: conversationUrl => this.#conversationPolicy.record(sessionId, conversationUrl),
      traceId: `gemini-${Date.now().toString(36)}`,
      signal: incoming.abortSignal,
      onTextDelta: delta => emit(textDelta(delta)),
    });
    emit(done());
  }

  get activeTurnCount(): number {
    return this.#driver.activeTurnCount;
  }

  async close(): Promise<void> {
    await this.#driver.close();
  }
}
