# `@tsuuanmi/pi-ai`

[Package README](../../../packages/ai/README.md) | [Package reference](../../../packages/ai/docs/index.md) | [Public barrel](../../../packages/ai/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi-ai` is Pi's provider-neutral model and streaming layer. It gives higher layers one protocol for model metadata, request context, messages, tools, usage, and incremental assistant events, then adapts that protocol to concrete provider APIs.

It is a workspace leaf: it has no dependency on another Pi package.

## Boundary

**Owns**

- Normalized model, context, message, tool, usage, stop-reason, and streaming-event types.
- Provider registration and dispatch by `model.api`.
- Built-in Anthropic Messages, OpenAI Chat Completions, OpenAI Responses, and OpenAI Codex Responses adapters.
- Generated model metadata, lookup, compatibility overrides, thinking capabilities, and cost calculation.
- Tool-call schema validation and coercion.
- OAuth flow and refresh primitives plus OAuth-provider registration.
- Generic assistant event streams, HTTP proxy resolution, and server-proxy stream reconstruction.
- Cleanup hooks for provider session resources such as reused Codex websocket sessions.

**Does not own**

- Agent turns, tool execution, retry policy across turns, or conversation control; Agent owns those.
- API-key, OAuth-token, or account persistence; Pi owns credential storage.
- Model selection defaults, availability filtering, settings, or extension lifecycle; Pi owns those policies.
- Application sessions, workflow state, UI, or CLI behavior.

## Public entry points

| Import | Surface |
|---|---|
| `@tsuuanmi/pi-ai` | Protocol types, model catalog/configuration, provider registry, stream/complete, event streams, schema validation, OAuth types, and selected provider utilities |
| `@tsuuanmi/pi-ai/anthropic` | Anthropic stream function and options |
| `@tsuuanmi/pi-ai/openai-completions` | OpenAI Chat Completions stream, options, and message conversion |
| `@tsuuanmi/pi-ai/openai-responses` | OpenAI Responses stream and options |
| `@tsuuanmi/pi-ai/openai-codex-responses` | Codex Responses stream, websocket diagnostics, and cleanup |
| `@tsuuanmi/pi-ai/openai-codex-usage` | Codex usage-window and credit APIs |
| `@tsuuanmi/pi-ai/oauth` | OAuth login, refresh, PKCE/device-code helpers, and registry |

`#ai/*` aliases are internal. Consumers should not deep-import source or undeclared `dist` paths.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Protocol | [`src/protocol/`](../../../packages/ai/src/protocol) | Canonical request context, messages, content blocks, tools, usage, stream options, and assistant events |
| Model catalog | [`src/model/`](../../../packages/ai/src/model) | Generated metadata, typed lookup, compatibility settings, thinking-level support, and cost calculation |
| Stream facade | [`src/stream.ts`](../../../packages/ai/src/stream.ts) | Resolves the provider registered for `model.api`; `complete()` consumes the same stream to its terminal message |
| Provider registry | [`src/provider/provider-registry.ts`](../../../packages/ai/src/provider/provider-registry.ts) | Registers, finds, resets, and removes provider stream functions; tracks session-resource cleanup callbacks |
| Built-in providers | [`src/provider/built-ins.ts`](../../../packages/ai/src/provider/built-ins.ts) | Registers lazy wrappers for the built-in API families |
| Anthropic/OpenAI adapters | [`src/provider/`](../../../packages/ai/src/provider) | Converts normalized context to provider requests and provider responses back to normalized events |
| Event transport | [`src/transport/event-stream.ts`](../../../packages/ai/src/transport/event-stream.ts) | Async iterable event queue with a final-result promise |
| Proxy transport | [`src/transport/proxy.ts`](../../../packages/ai/src/transport/proxy.ts) | Reconstructs a normalized assistant stream from a server proxy |
| Schema validation | [`src/schema/`](../../../packages/ai/src/schema) | Compiles TypeBox schemas, validates/coerces tool arguments, and reports structured validation failures |
| OAuth | [`src/auth/oauth/`](../../../packages/ai/src/auth/oauth) | Provider-neutral credentials and provider-specific login/refresh flows |

## Model-call data flow

```text
Model + Context + StreamOptions
  -> stream()
  -> provider registry lookup by model.api
  -> lazy provider adapter
  -> provider SDK / HTTP / websocket request
  -> normalized AssistantMessageEvent values
  -> AssistantMessageEventStream
  -> caller iterates events or awaits result()
```

A provider adapter owns wire conversion, incremental parsing, provider usage normalization, and construction of the final `AssistantMessage`. It may emit tool calls, but the caller decides whether and how to execute them.

## Dependencies

### Workspace

None.

### External runtime

| Dependency | Why it is used |
|---|---|
| `@anthropic-ai/sdk` | Anthropic Messages requests, streams, and types |
| `openai` | OpenAI Completions/Responses requests, streams, and types |
| `partial-json` | Best-effort parsing of partial streamed tool arguments |
| `typebox` | Public schemas/types plus compiled validation and conversion |

The package also uses Web APIs such as `fetch`, `AbortSignal`, streams, headers, and URLs. OAuth, generation, and some provider support use Node built-ins.

## Interactions with other packages

| Consumer | Contract |
|---|---|
| `@tsuuanmi/pi-agent` | Converts `AgentMessage[]` to AI `Context`, calls an injected or default `StreamFunction`, consumes assistant events, validates tool arguments, and executes tools outside AI |
| `@tsuuanmi/pi-workflows` | Uses model and event-stream types for workflow-backed agent adapters |
| `@tsuuanmi/pi` | Uses catalogs and provider/OAuth registries, supplies credentials and settings, registers extension providers, and exposes selected model APIs through the SDK |
| `@tsuuanmi/pi-orchestrator` | Uses AI only in package tests; runtime orchestration reaches models through Agent |

## State and lifecycle

AI keeps process-local registries and generated catalog data. It does not write Pi settings, credentials, or sessions. A host that supplies a `sessionId` can call `cleanupSessionResources(sessionId)` when the session ends so provider-owned reusable resources are released.

Importing the stream surface registers built-in providers. Custom providers can be tagged with a source id and removed as a group when an extension unloads.

## Extension points

- `registerProvider()` and `unregisterProviders()` for custom API implementations.
- `createAssistantMessageEventStream()` for adapters that produce normalized events.
- `registerSessionResourceCleanup()` for provider-owned session resources.
- `registerOAuthProvider()` for additional OAuth login/refresh behavior.
- Custom `Model` values and model compatibility overrides.
- `StreamOptions` hooks for payload inspection/mutation, response observation, headers, environment, transport, cancellation, retries, and timeout policy.

## Runtime constraints

- ESM; package engine is Node.js 22.19 or newer.
- The main protocol/stream surface is designed around browser-available Web APIs, but provider credentials should normally be kept behind a server boundary in browser applications.
- The OAuth entry is Node-oriented; browser OAuth login is not supported.
- Built-in provider implementations load lazily on first use.
- Package build regenerates model metadata before TypeScript compilation.
