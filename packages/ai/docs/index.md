# @tsuuanmi/pi-ai Documentation

Unified LLM API with automatic model discovery, provider configuration, token and cost tracking, context serialization, and cross-provider handoffs.

## Start here

- [Streaming and Completion](streaming.md) - `stream()`, `complete()`, `streamSimple()`, `completeSimple()` APIs, event types, and streaming protocol details.
- [Models and Providers](models.md) - Model registry, custom models, provider APIs, and environment variable configuration.
- [Context and Messages](context.md) - `Context`, `AssistantMessage`, `ToolCall`, `ToolResultMessage`, and cross-provider message transformation.
- [Tools](tools.md) - Defining tools with TypeBox schemas, validation, and tool call handling.
- [Thinking and Reasoning](reasoning.md) - Extended thinking, `streamSimple`/`completeSimple`, provider-specific options, and streaming thinking content.
- [Error Handling](error-handling.md) - Abort handling, context overflow detection, error recovery, and diagnostics.
- [Browser and Node.js](browser-usage.md) - Environment detection, API key resolution, provider-scoped env overrides, and Bun sandbox fallbacks.

## Providers

- [API Registry](providers/api-registry.md) - Built-in providers, lazy loading, custom API registration, and `registerApiProvider`.
- [Anthropic](providers/anthropic.md) - Claude models, extended thinking, OAuth, and prompt caching.
- [OpenAI](providers/openai.md) - OpenAI Responses, Completions, and Codex API variants.
- [Prompt Cache](providers/openai-prompt-cache.md) - OpenAI prompt caching and `CacheRetention`.
- [Register Built-ins](providers/register-builtins.md) - Automatic registration of built-in providers.
- [Simple Options](providers/simple-options.md) - Shared streaming options and transport modes.
- [Transform Messages](providers/transform-messages.md) - Provider-specific message format conversion.
- [Adding a New Provider](providers/adding-provider.md) - Step-by-step guide for implementing a new LLM provider.
- [Faux Provider for Tests](providers/faux-provider.md) - `registerFauxProvider()`, scripted responses, token estimation, and multi-model setups.

## Utilities

- [Validation](validation.md) - TypeBox schema validation, `validateToolCall`, and custom validators.
- [Utility Functions](utilities.md) - `StringEnum`, `shortHash`, `visibleWidth`, JSON repair parsing, proxy configuration, and session resource cleanup.
- [Abort Signals](utils/abort-signals.md) - `timeoutSignal()`, `composeSignals()`, and cancellation patterns.
- [Diagnostics](utils/diagnostics.md) - Diagnostic collection for provider requests.
- [Event Stream](utils/event-stream.md) - `EventStream` class for typed async streaming.
- [Hash](utils/hash.md) - `shortHash()` for session and request identifiers.
- [HTTP Headers](utils/headers.md) - Header construction for provider requests.
- [JSON Parse](utils/json-parse.md) - `parseStreamingJson()`, `repairJson()` for LLM output parsing.
- [Node HTTP Proxy](utils/node-http-proxy.md) - HTTP proxy configuration for Node.js.
- [Overflow](utils/overflow.md) - Context overflow detection.
- [Provider Environment](utils/provider-env.md) - `getProviderEnvValue()`, `findEnvKeys()`, `getEnvApiKey()`.
- [Sanitize Unicode](utils/sanitize-unicode.md) - `sanitizeSurrogates()` for safe text handling.
- [TypeBox Helpers](utils/typebox-helpers.md) - `createStringEnum()`, `toJsonSchema()` for tool schemas.
- [OAuth](utils/oauth.md) - Anthropic and OpenAI Codex OAuth login flows, token refresh, and credential management.