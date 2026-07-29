# @tsuuanmi/pi-ai Documentation

Provider and model API with automatic model discovery, provider registration, streaming, token and cost tracking, context serialization, OAuth, and browser/server proxy support.

This directory mirrors `packages/ai/src/`. Each section below maps to the matching source folder.

## Entry Points

- [index](index.md) - package exports and public subpath exports.
- [stream](stream.md) - `stream()` and `complete()` provider dispatch.

## Source Layout

- [auth/oauth](auth/oauth/index.md) - OAuth provider registry, login flows, token refresh, and device-code polling.
- [model](model/index.md) - model shape, catalog lookup, config schemas, requests, responses, cost, and thinking-level helpers.
- [parsing](parsing/json-parser.md) - JSON repair, partial streaming JSON parsing, and surrogate sanitization.
- [protocol](protocol/index.md) - context, content, messages, tools, usage, options, ids, and diagnostics.
- [provider](provider/index.md) - provider registry, built-ins, provider env, and lazy loading.
  - [provider/anthropic](provider/anthropic/index.md) - Anthropic Messages provider.
  - [provider/openai](provider/openai/index.md) - OpenAI-family providers and shared behavior.
  - [provider/openai/codex](provider/openai/codex/index.md) - Codex Responses streaming and usage summaries.
  - [provider/openai/completions](provider/openai/completions/index.md) - OpenAI-compatible Chat Completions.
  - [provider/openai/responses](provider/openai/responses/index.md) - OpenAI Responses API.
- [schema](schema/schema-validator.md) - TypeBox/string-enum helpers and tool argument validation.
- [transport](transport/index.md) - event streams, HTTP proxy resolution, and server proxy streaming.

## Public Package Subpaths

- `@tsuuanmi/pi-ai` maps to `src/index.ts`.
- `@tsuuanmi/pi-ai/oauth` maps to `src/auth/oauth/index.ts`.
- `@tsuuanmi/pi-ai/anthropic` maps to `src/provider/anthropic/index.ts`.
- `@tsuuanmi/pi-ai/openai-completions` maps to `src/provider/openai/completions/index.ts`.
- `@tsuuanmi/pi-ai/openai-responses` maps to `src/provider/openai/responses/index.ts`.
- `@tsuuanmi/pi-ai/openai-codex-responses` maps to `src/provider/openai/codex/responses.ts`.
- `@tsuuanmi/pi-ai/openai-codex-usage` maps to `src/provider/openai/codex/usage.ts`.
