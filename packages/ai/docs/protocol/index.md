# protocol

Mirrors `src/protocol/`.

## Files

- `content.ts` - assistant content blocks: text, thinking, and tool calls.
- `context.ts` - request context containing system prompt, messages, and tools.
- `diagnostic.ts` - diagnostic records and error extraction helpers.
- `ids.ts` - API and provider id types.
- `index.ts` - protocol re-export barrel.
- `message.ts` - user, assistant, tool-result messages, stop reasons, and stream events.
- `options.ts` - stream options, cache retention, transport choice, response callback types, and provider env overrides.
- `tool.ts` - TypeBox-backed tool definition.
- `usage.ts` - token usage, cache usage, cost, and usage provenance.

## Context

```ts
type Context = {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
};
```

Messages can be:

- `UserMessage` with string content or text blocks.
- `AssistantMessage` with content blocks, model/provider metadata, usage, diagnostics, stop reason, and optional response ids.
- `ToolResultMessage` with text content, tool call linkage, optional details, and `isError`.

## Stream events

Providers emit `AssistantMessageEvent` values through `AssistantMessageEventStream`:

- `start`
- `text_start`, `text_delta`, `text_end`
- `thinking_start`, `thinking_delta`, `thinking_end`
- `toolcall_start`, `toolcall_delta`, `toolcall_end`
- terminal `done` or `error`

Terminal `done` reasons are `stop`, `length`, or `toolUse`. Terminal `error` reasons are `error` or `aborted`.

## Options

`StreamOptions` is the shared option bag used by built-in and custom providers. Important fields include:

- Generation: `temperature`, `maxTokens`, `reasoning`.
- Control: `signal`, `timeoutMs`, `maxRetries`, `maxRetryDelayMs`.
- Transport: `transport`, `websocketConnectTimeoutMs`.
- Auth/customization: `apiKey`, `headers`, `env`, `metadata`.
- Cache/session: `cacheRetention`, `sessionId`.
- Hooks: `onPayload(payload, model)` and `onResponse(response, model)`.

`ProviderEnv` lets callers pass provider-scoped environment overrides that take precedence over `process.env`.

## IDs

Known APIs are `openai-completions`, `openai-responses`, `openai-codex-responses`, and `anthropic-messages`. `Api` and `ProviderId` also accept custom strings for extensions.
