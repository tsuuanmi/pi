# provider/anthropic

Mirrors `src/provider/anthropic/index.ts`.

The Anthropic provider implements the `anthropic-messages` API and is exported from `@tsuuanmi/pi-ai/anthropic`.

## Options

`AnthropicOptions` extends `StreamOptions` with:

- `thinkingEnabled?: boolean` - enables Anthropic extended/adaptive thinking.
- `effort?: "low" | "medium" | "high" | "xhigh" | "max"` - provider-specific thinking effort.
- `thinkingDisplay?: "summarized" | "omitted"` - whether thinking text is returned or only signatures are preserved.
- `toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string }` - Anthropic tool-choice mode.
- `client?: Anthropic` - pre-built SDK client, useful for custom clients.

Shared `StreamOptions.reasoning` is mapped into Anthropic thinking options when possible.

## Auth and environment

The provider uses `options.apiKey` or provider environment values. It supports caller-provided `options.env` for browser/server injection and normal `process.env` lookup in Node-like runtimes.

## Cache retention

`cacheRetention` defaults to `short`. For backward compatibility, `PI_CACHE_RETENTION=long` also selects long retention when no explicit option is set. Long cache retention is only sent when model compatibility says it is supported.

## Behavior

- Converts the shared `Context`/`Message` protocol to Anthropic Messages payloads.
- Emits shared `AssistantMessageEvent` stream events.
- Preserves thinking signatures for multi-turn continuation.
- Tracks usage and applies model cost calculation.
- Supports `onPayload` and `onResponse` hooks from shared stream options.
- Sanitizes unpaired surrogate characters before sending content.
