# provider/openai/codex

Mirrors `src/provider/openai/codex/`.

## Files

- `responses.ts` - ChatGPT/Codex Responses streaming provider exported as `@tsuuanmi/pi-ai/openai-codex-responses`.
- `usage.ts` - ChatGPT/Codex usage and reset-credit helpers exported as `@tsuuanmi/pi-ai/openai-codex-usage`.

## Responses provider

`OpenAICodexResponsesOptions` extends `StreamOptions` with:

- `reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"`
- `reasoningSummary?: "auto" | "concise" | "detailed" | "off" | "on" | null`
- `serviceTier?: ResponseCreateParamsStreaming["service_tier"]`
- `textVerbosity?: "low" | "medium" | "high"`

The provider supports SSE and websocket-style transports through the shared `transport` option. It has bounded header/connect timeouts so stalled Codex streams fail instead of leaving callers waiting indefinitely.

## Usage helpers

`usage.ts` exposes:

- `getOpenAICodexUsageCacheTtlMs()`
- `fetchOpenAICodexUsageSummary(model, authProvider)`
- `fetchOpenAICodexResetCredits(model, authProvider)`
- `consumeOpenAICodexResetCredit(model, authProvider, creditId)`
- `OpenAICodexUsageSummary`
- `OpenAICodexResetCreditsSummary`
- `OpenAICodexConsumeResetCreditResult`
- `OpenAICodexUsageAuthProvider`

The helpers inspect ChatGPT/Codex usage windows and reset credits, normalize Codex base URLs, cache usage summaries briefly, and derive the ChatGPT account id from OAuth JWT claims when needed.

## Auth

Codex streaming can use API-key-like credentials supplied through `StreamOptions.apiKey` or OAuth-derived credentials from `@tsuuanmi/pi-ai/oauth`.
