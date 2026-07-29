# provider/openai

Mirrors `src/provider/openai/`.

## Files

- `stream-options.ts` - shared OpenAI option helpers, service-tier pricing, and prompt-cache-key clamping.
- `transform-messages.ts` - shared message/tool transformations used by OpenAI-compatible providers.
- `completions/index.ts` - Chat Completions-compatible streaming.
- `responses/index.ts` and `responses/shared.ts` - Responses API streaming and shared event processing.
- `codex/responses.ts` - ChatGPT/Codex Responses streaming, retrying, and transport handling.
- `codex/usage.ts` - Codex usage and reset-credit summary helpers.

## Shared options

OpenAI-family providers use the common `StreamOptions` fields for auth, headers, retries, cache/session hints, payload/response hooks, and transport selection.

`stream-options.ts` also provides:

- `clampOpenAIPromptCacheKey(key)` - limits prompt cache keys to OpenAI's maximum length.
- `getOpenAIServiceTierCostMultiplier(model, serviceTier)` - returns the cost multiplier for service tiers.
- `applyOpenAIServiceTierPricing(usage, serviceTier, model)` - adjusts usage cost after provider-reported usage is parsed.

## Message conversion

OpenAI-family providers convert the shared protocol into provider-specific message/input formats. Tool calls stream as shared `toolcall_*` events and use the shared JSON parser for partial arguments.
