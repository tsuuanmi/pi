# @tsuuanmi/pi-ai Documentation

Provider and model API with automatic model discovery, provider configuration, token and cost tracking, context serialization, and cross-provider handoffs.

## Core

- [Architecture](architecture.md) - package boundaries, runtime flow, and source layout.
- [Streaming and Completion](streaming.md) - `stream()`, `complete()`, stream events, and the provider protocol.
- [Models and Providers](models.md) - model lookup, provider ids, custom model configuration, and environment keys.
- [Context and Messages](context.md) - `Context`, messages, content blocks, tool calls, and tool results.
- [Tools](tools.md) - TypeBox tool schemas, validation, and tool call handling.
- [Thinking and Reasoning](reasoning.md) - reasoning levels, thinking blocks, and provider behavior.
- [Validation](validation.md) - schema validation helpers.
- [Error Handling](error-handling.md) - abort handling, context overflow, and diagnostics.
- [Browser and Node.js](browser-usage.md) - runtime behavior and proxy support.

## Providers

- [Anthropic](providers/anthropic.md) - Claude models, extended thinking, OAuth, and prompt caching.
- [OpenAI](providers/openai.md) - OpenAI Responses, Completions, and Codex API variants.
- [Adding a New Provider](providers/adding-provider.md) - checklist for implementing a provider.

## Utilities

- [Utility Functions](utilities.md) - JSON parsing, output limits, OAuth, and helpers.
- [JSON Parse](utils/json-parse.md) - `parseStreamingJson()`, `parseJsonWithRepair()`, and `repairJson()`.
- [OAuth](utils/oauth.md) - Anthropic and OpenAI Codex OAuth login flows.
