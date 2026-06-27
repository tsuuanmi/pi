# Transform Messages

Message transformation utilities for provider-specific format conversion.

## Purpose

Different LLM providers have different message format requirements. `transform-messages.ts` provides transformations to convert between internal message formats and provider-specific formats.

## Common Transformations

- Converting tool results between Anthropic and OpenAI formats
- Handling provider-specific content blocks
- Mapping thinking/reasoning content between providers
- Stripping unsupported content types for specific providers

## See Also

- [Context and Messages](../context.md) - Core message types
- [Streaming](../streaming.md) - How messages flow through streaming