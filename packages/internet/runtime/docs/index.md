# Pi Internet Runtime Documentation

`pi-internet-runtime` is the isolated Bun runtime used by `@tsuuanmi/pi-internet`. The pages
below mirror every file under `src/` and explain each module’s public surface, invariants, and
relationships. The TypeScript source remains authoritative for exact implementation details.

## Architecture at a glance

- `core/` contains the HTTP host, process/service lifecycle, configuration, and event primitives.
- `browser/` owns reusable browser mechanics and browser-backed provider implementations.
- `browser/chatgpt-web/` owns ChatGPT selectors, login, interaction, completion, and diagnostics.
- `providers/chatgpt-web/protocol/` translates OpenAI Responses requests and events.
- `providers/chatgpt-web/turn/` coordinates trusted task metadata, sessions, and tool brokering.
- `providers/chatgpt-web/conversation/` protects durable continuation and replay semantics.
- `providers/chatgpt-web/transport/` handles native forwarding, tunnel management, and wire capture.
- `providers/chatgpt-web/lifecycle/` owns setup, diagnostics, and administrative control.

## Source-mirrored reference

### `providers/chatgpt-web/`

- [`providers/chatgpt-web/adapter-error.ts`](providers/chatgpt-web/adapter-error.md)
- [`providers/chatgpt-web/adapter.ts`](providers/chatgpt-web/adapter.md)
- [`providers/chatgpt-web/content/image.ts`](providers/chatgpt-web/content/image.md)
- [`providers/chatgpt-web/content/markdown.ts`](providers/chatgpt-web/content/markdown.md)
- [`providers/chatgpt-web/content/prompt.ts`](providers/chatgpt-web/content/prompt.md)
- [`providers/chatgpt-web/content/tokens.ts`](providers/chatgpt-web/content/tokens.md)
- [`providers/chatgpt-web/content/turndown-plugin-gfm.d.ts`](providers/chatgpt-web/content/turndown-plugin-gfm.d.md)
- [`providers/chatgpt-web/content/usage.ts`](providers/chatgpt-web/content/usage.md)
- [`providers/chatgpt-web/conversation/canary.ts`](providers/chatgpt-web/conversation/canary.md)
- [`providers/chatgpt-web/conversation/journal.ts`](providers/chatgpt-web/conversation/journal.md)
- [`providers/chatgpt-web/conversation/sync.ts`](providers/chatgpt-web/conversation/sync.md)
- [`providers/chatgpt-web/lifecycle/config.ts`](providers/chatgpt-web/lifecycle/config.md)
- [`providers/chatgpt-web/lifecycle/control.ts`](providers/chatgpt-web/lifecycle/control.md)
- [`providers/chatgpt-web/lifecycle/doctor.ts`](providers/chatgpt-web/lifecycle/doctor.md)
- [`providers/chatgpt-web/lifecycle/setup.ts`](providers/chatgpt-web/lifecycle/setup.md)
- [`providers/chatgpt-web/models/catalog.ts`](providers/chatgpt-web/models/catalog.md)
- [`providers/chatgpt-web/models/model.ts`](providers/chatgpt-web/models/model.md)
- [`providers/chatgpt-web/models/models.ts`](providers/chatgpt-web/models/models.md)
- [`providers/chatgpt-web/protocol/responses/bridge.ts`](providers/chatgpt-web/protocol/responses/bridge.md)
- [`providers/chatgpt-web/protocol/responses/compaction.ts`](providers/chatgpt-web/protocol/responses/compaction.md)
- [`providers/chatgpt-web/protocol/responses/errors.ts`](providers/chatgpt-web/protocol/responses/errors.md)
- [`providers/chatgpt-web/protocol/responses/parser.ts`](providers/chatgpt-web/protocol/responses/parser.md)
- [`providers/chatgpt-web/protocol/responses/reasoning-envelope.ts`](providers/chatgpt-web/protocol/responses/reasoning-envelope.md)
- [`providers/chatgpt-web/protocol/responses/schema.ts`](providers/chatgpt-web/protocol/responses/schema.md)
- [`providers/chatgpt-web/protocol/responses/state.ts`](providers/chatgpt-web/protocol/responses/state.md)
- [`providers/chatgpt-web/protocol/types.ts`](providers/chatgpt-web/protocol/types.md)
- [`providers/chatgpt-web/server/routes.ts`](providers/chatgpt-web/server/routes.md)
- [`providers/chatgpt-web/tools/mcp-server.ts`](providers/chatgpt-web/tools/mcp-server.md)
- [`providers/chatgpt-web/tools/web-search/synthetic-tool.ts`](providers/chatgpt-web/tools/web-search/synthetic-tool.md)
- [`providers/chatgpt-web/transport/native-passthrough.ts`](providers/chatgpt-web/transport/native-passthrough.md)
- [`providers/chatgpt-web/transport/tunnel-service.ts`](providers/chatgpt-web/transport/tunnel-service.md)
- [`providers/chatgpt-web/transport/tunnel.ts`](providers/chatgpt-web/transport/tunnel.md)
- [`providers/chatgpt-web/transport/wire-response.ts`](providers/chatgpt-web/transport/wire-response.md)
- [`providers/chatgpt-web/turn/adapter.ts`](providers/chatgpt-web/turn/adapter.md)
- [`providers/chatgpt-web/turn/broker.ts`](providers/chatgpt-web/turn/broker.md)
- [`providers/chatgpt-web/turn/environment.ts`](providers/chatgpt-web/turn/environment.md)
- [`providers/chatgpt-web/turn/execution.ts`](providers/chatgpt-web/turn/execution.md)
- [`providers/chatgpt-web/turn/thread-environment.ts`](providers/chatgpt-web/turn/thread-environment.md)

### `browser/`

- [`browser/session.ts`](browser/session.md)
- [`browser/response-capture.ts`](browser/response-capture.md)
- [`browser/turn.ts`](browser/turn.md)
- [`browser/chatgpt-web/completion.ts`](browser/chatgpt-web/completion.md)
- [`browser/chatgpt-web/diagnostics.ts`](browser/chatgpt-web/diagnostics.md)
- [`browser/chatgpt-web/interactions.ts`](browser/chatgpt-web/interactions.md)
- [`browser/chatgpt-web/login-state.ts`](browser/chatgpt-web/login-state.md)
- [`browser/chatgpt-web/login.ts`](browser/chatgpt-web/login.md)
- [`browser/chatgpt-web/session.ts`](browser/chatgpt-web/session.md)
- [`browser/chatgpt-web/turn-driver.ts`](browser/chatgpt-web/turn-driver.md)
- [`browser/chatgpt-web/wire-capture.ts`](browser/chatgpt-web/wire-capture.md)
- [`browser/chatgpt-web/worker.ts`](browser/chatgpt-web/worker.md)

### `core/`

- [`core/config.ts`](core/config.md)
- [`core/event-queue.ts`](core/event-queue.md)
- [`core/http-body.ts`](core/http-body.md)
- [`core/process.ts`](core/process.md)
- [`core/server.ts`](core/server.md)
- [`core/service.ts`](core/service.md)

### Runtime entrypoints

- [`cli.ts`](cli.md)
