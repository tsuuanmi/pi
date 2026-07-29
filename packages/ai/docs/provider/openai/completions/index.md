# provider/openai/completions

Mirrors `src/provider/openai/completions/index.ts`.

The OpenAI Completions provider implements OpenAI-compatible Chat Completions streaming and is exported from `@tsuuanmi/pi-ai/openai-completions`.

## Options

It consumes shared `StreamOptions` and supports model compatibility flags from `OpenAICompletionsCompat`, including:

- `supportsStore`
- `supportsDeveloperRole`
- `supportsReasoningEffort`
- `supportsUsageInStreaming`
- `maxTokensField`
- `requiresToolResultName`
- `requiresAssistantAfterToolResult`
- `requiresThinkingAsText`
- `requiresReasoningContentOnAssistantMessages`
- `thinkingFormat`
- `supportsStrictMode`
- `cacheControlFormat`
- `sendSessionAffinityHeaders`
- `supportsLongCacheRetention`
- `supportsPromptCacheKey`

## Behavior

- Converts shared messages to OpenAI-compatible chat messages.
- Streams text, thinking, tool-call, done, and error events through `AssistantMessageEventStream`.
- Parses usage and applies model cost calculation.
- Supports custom headers, env overrides, retries, payload hooks, response hooks, and proxy environment resolution.
