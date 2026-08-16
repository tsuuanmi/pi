# Source Repositories — Reference

The `internet` package owns its extension boundary and its isolated browser runtime. When
implementing or debugging, treat Pi source and the neutral runtime package as authoritative. This
page maps each concept to the relevant files.

## Repository 1 — the daemon (the engine `internet` wraps)

**Path:** `vendor/runtime`

This is the private runtime that `internet` talks to over loopback HTTP. It owns the browser
adapter, Responses transport, turn broker, and SSE framing. It is Pi-owned; it is not synchronized
as an upstream package.

All daemon table paths below are relative to `vendor/runtime/`.

| Concept | Source file |
|---------|-------------|
| Provider-neutral Bun HTTP host | `src/server.ts` |
| ChatGPT loopback routes | `src/adapters/chatgpt-web/server.ts` |
| Responses SSE bridge + batch builder | `src/adapters/chatgpt-web/responses/bridge.ts` |
| Request parsing (Responses → internal) | `src/adapters/chatgpt-web/responses/parser.ts` |
| Responses schema | `src/adapters/chatgpt-web/responses/schema.ts` |
| Replay / continuation state | `src/adapters/chatgpt-web/responses/state.ts` |
| Compaction | `src/adapters/chatgpt-web/responses/compaction.ts` |
| Reasoning envelope (`ocxr1`) | `src/adapters/chatgpt-web/responses/reasoning-envelope.ts` |
| Neutral runtime paths / durable commands | `src/config.ts` |
| ChatGPT config / defaults / validation | `src/adapters/chatgpt-web/config.ts` |
| Adapter types (`ParsedRequest`, `AdapterEvent`, `Usage`) | `src/adapters/chatgpt-web/types.ts` |
| Native passthrough (models/search → provider backend) | `src/adapters/chatgpt-web/native-passthrough.ts` |
| Model catalog augmentation | `src/adapters/chatgpt-web/model-catalog.ts`, `src/adapters/chatgpt-web/models.ts` |
| Upstream Codex `config.toml` edits | Removed; Pi owns route and account configuration |
| HTTP body limits | `src/http-body.ts` |
| Adapter error classification | `src/adapters/chatgpt-web/responses/errors.ts` |
| ChatGPT turn contract | `src/adapters/chatgpt-web/turn-adapter.ts` |
| ChatGPT Web adapter (runTurn) | `src/adapters/chatgpt-web/adapter.ts` |
| Turn execution / sessions | `src/adapters/chatgpt-web/turn-execution.ts` |
| Turn broker (token/binding/revoke) | `src/adapters/chatgpt-web/turn-broker.ts` |
| **Browser automation** | `src/adapters/chatgpt-web/browser-worker.ts` |
| **Browser login** | `src/adapters/chatgpt-web/browser-login.ts` |
| **ChatGPT session selectors / account caps** | `src/adapters/chatgpt-web/session.ts` |
| MCP server (adapter tools) | `src/adapters/chatgpt-web/mcp-server.ts` |
| Trusted environment extraction | `src/adapters/chatgpt-web/environment.ts` |
| Prompt compilation (transport contract) | `src/adapters/chatgpt-web/prompt.ts` |
| Model/effort resolution | `src/adapters/chatgpt-web/model.ts` |
| Rolling checkpoint (Luna) | `src/adapters/chatgpt-web/rolling-checkpoint.ts` |
| Concurrency cap (`MAX_CHATGPT_BROWSER_TABS`) | `src/adapters/chatgpt-web/concurrency.ts` |
| Tunnel client (supply-chain) | `src/adapters/chatgpt-web/tunnel.ts`, `src/adapters/chatgpt-web/tunnel-service.ts` |
| Doctor checks | `src/adapters/chatgpt-web/doctor.ts` |
| Setup flow | `src/adapters/chatgpt-web/setup.ts` |
| CLI entry | `src/cli.ts` |

## Repository 2 — Prometheus (a sibling to learn from)

**Path:** external Prometheus reference repository

Prometheus is a **standalone Electron MCP/REST service** with the same core idea (browser-based AI
providers). Read it to borrow multi-provider breadth, model aliases, and the network-interception
capture pattern.

| Concept | Source file |
|---------|-------------|
| MCP server (~56 tools) | `src/mcp-server.js` |
| REST API (`/v1/chat/completions`, `/v1/models`) | `electron/rest-api.cjs` |
| Provider catalog (11 providers) | `src/provider-catalog.cjs` |
| Provider automation | `src/provider-automation.cjs` |
| Network-interception capture | `src/automation/*.cjs` |
| Browser manager | `electron/browser-manager.cjs` |
| Per-provider senders | `electron/provider-senders/*.cjs` |
| Skills | `skills/*.md` |
| Enabled providers | `src/enabled-providers.json` |
| Architecture docs | `docs/architecture/PROVIDERS.md`, `docs/guides/ADDING-A-NEW-PROVIDER.md` |

## Repository 3 — Pi (the host the package plugs into)

**Path:** repository root

The `internet` package is a Pi extension. The relevant Pi APIs:

| Concept | Source file |
|---------|-------------|
| Extension API (`registerTool`, `registerProvider`, hooks, ...) | `packages/pi/src/api/extension-types.ts` |
| Tool spec (`PiToolSpec`, `ExtensionToolSpec`) | `packages/pi/src/tool/spec.ts` |
| Provider config (`ProviderConfig`, `ProviderModelConfig`) | `packages/pi/src/api/provider-types.ts` |
| Event/hook API (`on(...)`, `onHook(...)`) | `packages/pi/src/hooks/api.ts` |
| Observer events (`ExtensionEvent`) | `packages/pi/src/hooks/events.ts` |
| Control hooks (`ToolCallHookResult`, etc.) | `packages/pi/src/hooks/hook-types.ts` |
| Extension loader (default-export factory) | `packages/pi/src/loader/extensions/loader.ts` |
| Package manifest (`pi` field) | `packages/pi/src/resources/manifest.ts` |
| Discovery / settings | `packages/pi/src/resources/discovery.ts`, `packages/pi/docs/settings/index.md` |
| OpenAI Responses stream handler | `packages/ai/src/provider/openai/responses/index.ts` |
| `Api` type (`openai-responses`, `anthropic-messages`) | `packages/ai/src/protocol/ids.ts` |
| Reference package (workflows) | `packages/workflows/` |
| Package authoring standard | `packages/pi/docs/package/packages.md`, `docs/architecture/package-and-extension-authoring.md` |
