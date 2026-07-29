# provider/openai/responses

Mirrors `src/provider/openai/responses/`.

The OpenAI Responses provider implements the `openai-responses` API and is exported from `@tsuuanmi/pi-ai/openai-responses`.

## Files

- `index.ts` - provider entry point, request construction, streaming, and errors.
- `shared.ts` - Responses input/tool conversion and stream-event processing shared with Codex.

## Options

The provider consumes shared `StreamOptions`. Relevant model compatibility flags from `OpenAIResponsesCompat` include:

- `supportsDeveloperRole`
- `sendSessionIdHeader`
- `supportsLongCacheRetention`

OpenAI service-tier options are handled by shared OpenAI helpers when providers expose them.

## Behavior

- Converts the shared `Context` to Responses `input` and `instructions`.
- Converts TypeBox tools to Responses tools.
- Emits shared `AssistantMessageEvent` values while preserving partial assistant state.
- Tracks provider usage, cache reads/writes, and costs.
- Supports `onPayload` request mutation and `onResponse` response inspection hooks.
