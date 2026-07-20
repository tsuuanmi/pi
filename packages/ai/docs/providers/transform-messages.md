# Transform Messages

Message transformation for provider-specific format conversion.

## Purpose

`transformMessages()` (in `src/providers/openai/transform-messages.ts`) normalizes a `Message[]` before it is sent to a provider. It is used internally by the OpenAI providers and is not part of the public package surface; custom providers that need similar behavior can reuse it via the internal `#ai/providers/openai/transform-messages` module or re-implement the same rules.

## What It Does

- **User and tool result messages**: passed through unchanged (tool call IDs are rewritten if a mapping exists).
- **Assistant messages from the same model** (`provider`, `api`, and `model` match): kept as-is, including thinking blocks with signatures and redacted thinking.
- **Assistant messages from a different model**: thinking blocks are converted to plain `text` blocks (dropping `thinkingSignature`), redacted thinking is dropped, and `thoughtSignature` on tool calls is removed.
- **Tool call ID normalization**: cross-provider IDs (e.g. OpenAI Responses' 450+ char IDs with `|`) are normalized to IDs acceptable to the target provider (e.g. Anthropic's `^[a-zA-Z0-9_-]+$`, max 64 chars) via an optional `normalizeToolCallId` callback.
- **Orphaned tool calls**: if an assistant message contains tool calls without a following tool result (e.g. after filtering out an errored turn), synthetic `toolResult` messages with `isError: true` are inserted so the conversation remains valid.
- **Errored/aborted assistant messages**: skipped entirely, so partial turns are not replayed.

## Signature

```typescript
function transformMessages<TApi extends Api>(
  messages: Message[],
  model: Model<TApi>,
  normalizeToolCallId?: (id: string, model: Model<TApi>, source: AssistantMessage) => string,
): Message[];
```

## See Also

- [Context and Messages](../context.md) - Core message types and cross-provider handoffs
- [Streaming](../streaming.md) - How messages flow through streaming
