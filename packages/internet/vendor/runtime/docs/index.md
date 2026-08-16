# Pi Internet Runtime Documentation

`pi-internet-runtime` is the isolated Bun runtime used by `@tsuuanmi/pi-internet`. The pages
below mirror every file under `src/` and explain each module’s public surface, invariants, and
relationships. The TypeScript source remains authoritative for exact implementation details.

## Architecture at a glance

- `core/` contains the HTTP host, process/service lifecycle, configuration, and event primitives.
- `adapters/chatgpt-web/protocol/` translates OpenAI Responses requests and events.
- `adapters/chatgpt-web/browser/` drives the authenticated ChatGPT Web UI.
- `adapters/chatgpt-web/turn/` coordinates trusted task metadata, sessions, and tool brokering.
- `adapters/chatgpt-web/conversation/` protects durable continuation and replay semantics.
- `adapters/chatgpt-web/transport/` handles native forwarding, tunnel management, and wire capture.
- `adapters/chatgpt-web/lifecycle/` owns setup, diagnostics, and administrative control.

## Source-mirrored reference

### `adapters/`

- [`adapters/chatgpt-web/adapter-error.ts`](adapters/chatgpt-web/adapter-error.md)
- [`adapters/chatgpt-web/adapter.ts`](adapters/chatgpt-web/adapter.md)
- [`adapters/chatgpt-web/browser/login-state.ts`](adapters/chatgpt-web/browser/login-state.md)
- [`adapters/chatgpt-web/browser/login.ts`](adapters/chatgpt-web/browser/login.md)
- [`adapters/chatgpt-web/browser/session.ts`](adapters/chatgpt-web/browser/session.md)
- [`adapters/chatgpt-web/browser/worker.ts`](adapters/chatgpt-web/browser/worker.md)
- [`adapters/chatgpt-web/content/image.ts`](adapters/chatgpt-web/content/image.md)
- [`adapters/chatgpt-web/content/markdown.ts`](adapters/chatgpt-web/content/markdown.md)
- [`adapters/chatgpt-web/content/prompt.ts`](adapters/chatgpt-web/content/prompt.md)
- [`adapters/chatgpt-web/content/tokens.ts`](adapters/chatgpt-web/content/tokens.md)
- [`adapters/chatgpt-web/content/turndown-plugin-gfm.d.ts`](adapters/chatgpt-web/content/turndown-plugin-gfm.d.md)
- [`adapters/chatgpt-web/content/usage.ts`](adapters/chatgpt-web/content/usage.md)
- [`adapters/chatgpt-web/conversation/canary.ts`](adapters/chatgpt-web/conversation/canary.md)
- [`adapters/chatgpt-web/conversation/journal.ts`](adapters/chatgpt-web/conversation/journal.md)
- [`adapters/chatgpt-web/conversation/rolling-checkpoint.ts`](adapters/chatgpt-web/conversation/rolling-checkpoint.md)
- [`adapters/chatgpt-web/conversation/sync.ts`](adapters/chatgpt-web/conversation/sync.md)
- [`adapters/chatgpt-web/lifecycle/config.ts`](adapters/chatgpt-web/lifecycle/config.md)
- [`adapters/chatgpt-web/lifecycle/control.ts`](adapters/chatgpt-web/lifecycle/control.md)
- [`adapters/chatgpt-web/lifecycle/doctor.ts`](adapters/chatgpt-web/lifecycle/doctor.md)
- [`adapters/chatgpt-web/lifecycle/setup.ts`](adapters/chatgpt-web/lifecycle/setup.md)
- [`adapters/chatgpt-web/models/catalog.ts`](adapters/chatgpt-web/models/catalog.md)
- [`adapters/chatgpt-web/models/model.ts`](adapters/chatgpt-web/models/model.md)
- [`adapters/chatgpt-web/models/models.ts`](adapters/chatgpt-web/models/models.md)
- [`adapters/chatgpt-web/protocol/responses/bridge.ts`](adapters/chatgpt-web/protocol/responses/bridge.md)
- [`adapters/chatgpt-web/protocol/responses/compaction.ts`](adapters/chatgpt-web/protocol/responses/compaction.md)
- [`adapters/chatgpt-web/protocol/responses/errors.ts`](adapters/chatgpt-web/protocol/responses/errors.md)
- [`adapters/chatgpt-web/protocol/responses/parser.ts`](adapters/chatgpt-web/protocol/responses/parser.md)
- [`adapters/chatgpt-web/protocol/responses/reasoning-envelope.ts`](adapters/chatgpt-web/protocol/responses/reasoning-envelope.md)
- [`adapters/chatgpt-web/protocol/responses/schema.ts`](adapters/chatgpt-web/protocol/responses/schema.md)
- [`adapters/chatgpt-web/protocol/responses/state.ts`](adapters/chatgpt-web/protocol/responses/state.md)
- [`adapters/chatgpt-web/protocol/types.ts`](adapters/chatgpt-web/protocol/types.md)
- [`adapters/chatgpt-web/server/routes.ts`](adapters/chatgpt-web/server/routes.md)
- [`adapters/chatgpt-web/tools/mcp-server.ts`](adapters/chatgpt-web/tools/mcp-server.md)
- [`adapters/chatgpt-web/tools/web-search/synthetic-tool.ts`](adapters/chatgpt-web/tools/web-search/synthetic-tool.md)
- [`adapters/chatgpt-web/transport/native-passthrough.ts`](adapters/chatgpt-web/transport/native-passthrough.md)
- [`adapters/chatgpt-web/transport/tunnel-service.ts`](adapters/chatgpt-web/transport/tunnel-service.md)
- [`adapters/chatgpt-web/transport/tunnel.ts`](adapters/chatgpt-web/transport/tunnel.md)
- [`adapters/chatgpt-web/transport/wire-capture.ts`](adapters/chatgpt-web/transport/wire-capture.md)
- [`adapters/chatgpt-web/transport/wire-response.ts`](adapters/chatgpt-web/transport/wire-response.md)
- [`adapters/chatgpt-web/turn/adapter.ts`](adapters/chatgpt-web/turn/adapter.md)
- [`adapters/chatgpt-web/turn/broker.ts`](adapters/chatgpt-web/turn/broker.md)
- [`adapters/chatgpt-web/turn/environment.ts`](adapters/chatgpt-web/turn/environment.md)
- [`adapters/chatgpt-web/turn/execution.ts`](adapters/chatgpt-web/turn/execution.md)
- [`adapters/chatgpt-web/turn/thread-environment.ts`](adapters/chatgpt-web/turn/thread-environment.md)

### `core/`

- [`core/config.ts`](core/config.md)
- [`core/event-queue.ts`](core/event-queue.md)
- [`core/http-body.ts`](core/http-body.md)
- [`core/process.ts`](core/process.md)
- [`core/server.ts`](core/server.md)
- [`core/service.ts`](core/service.md)

### Runtime entrypoints

- [`cli.ts`](cli.md)
