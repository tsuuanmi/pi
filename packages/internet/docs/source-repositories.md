# Source Repositories — Reference

The `internet` package is a **thin client** over two existing repositories. When implementing or
debugging, read the source there. This page maps every concept in this package's design to the exact
files that implement it.

## Repository 1 — the daemon (the engine `internet` wraps)

**Path:** `/home/superman/workspaces/codex-chatgpt-web`

This is the standalone bridge that `internet` talks to over loopback HTTP. It owns the browser, the
ChatGPT session, the Responses→prompt compilation, the turn broker, and the SSE framing.

| Concept | Source file |
|---------|-------------|
| Loopback HTTP daemon (routes) | `src/server.ts` |
| Responses SSE bridge + batch builder | `src/bridge.ts` |
| Request parsing (Responses → internal) | `src/responses/parser.ts` |
| Responses schema | `src/responses/schema.ts` |
| Replay / continuation state | `src/responses/state.ts` |
| Compaction | `src/responses/compaction.ts` |
| Reasoning envelope (`ocxr1`) | `src/responses/reasoning-envelope.ts` |
| Config / defaults / validation | `src/config.ts` |
| Domain types (`CodexParsedRequest`, `AdapterEvent`, `CodexUsage`) | `src/types.ts` |
| Native passthrough (models/search → real Codex) | `src/native-passthrough.ts` |
| Model catalog augmentation | `src/model-catalog.ts`, `src/chatgpt-web-models.ts` |
| Reversible Codex `config.toml` edits | `src/codex-integration.ts` |
| HTTP body limits | `src/http-body.ts` |
| Adapter error classification | `src/lib/errors.ts` |
| Web-search synthetic tool | `src/web-search/synthetic-tool.ts` |
| Adapter base (`ProviderAdapter`) | `src/adapters/base.ts` |
| ChatGPT Web adapter (runTurn) | `src/adapters/chatgpt-web/index.ts` |
| Turn execution / sessions | `src/adapters/chatgpt-web/turn-execution.ts` |
| Turn broker (token/binding/revoke) | `src/adapters/chatgpt-web/turn-broker.ts` |
| **Browser automation** | `src/adapters/chatgpt-web/browser-worker.ts` |
| **Browser login** | `src/browser-login.ts` |
| **ChatGPT session selectors / account caps** | `src/chatgpt-session.ts` |
| Launcher browser host (CDP descriptor) | `src/launcher-browser-host.ts` |
| MCP server (codex_* tools) | `src/adapters/chatgpt-web/mcp-server.ts` |
| Trusted environment extraction | `src/adapters/chatgpt-web/environment.ts` |
| Prompt compilation (transport contract) | `src/adapters/chatgpt-web/prompt.ts` |
| Model/effort resolution | `src/adapters/chatgpt-web/model.ts` |
| Rolling checkpoint (Luna) | `src/adapters/chatgpt-web/rolling-checkpoint.ts` |
| Concurrency cap (`MAX_CHATGPT_BROWSER_TABS`) | `src/adapters/chatgpt-web/concurrency.ts` |
| Tunnel client (supply-chain) | `src/tunnel.ts`, `src/tunnel-service.ts` |
| Doctor checks | `src/doctor.ts` |
| Setup flow | `src/setup.ts` |
| CLI entry | `src/cli.ts` |

## Repository 2 — Prometheus (a sibling to learn from)

**Path:** `/home/superman/workspaces/prometheus`

Prometheus is a **standalone Electron MCP/REST service** with the same core idea (browser-based AI
backends). Read it to borrow multi-provider breadth, model aliases, and the network-interception
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

**Path:** `/home/superman/workspaces/pi`

The `internet` package is a Pi extension. The relevant Pi APIs:

| Concept | Source file |
|---------|-------------|
| Extension API (`registerTool`, `registerProvider`, hooks, ...) | `packages/pi/src/api/extension-types.ts` |
| Tool spec (`PiToolSpec`, `ExtensionToolSpec`) | `packages/pi/src/tool/spec.ts` |
| Provider config (`ProviderConfig`, `ProviderModelConfig`) | `packages/pi/src/api/provider-types.ts` |
| Hook API (`on("tool_call")`, ...) | `packages/pi/src/hooks/api.ts` |
| Hook events (`ToolCallEventResult`) | `packages/pi/src/hooks/events.ts` |
| Extension loader (default-export factory) | `packages/pi/src/loader/extensions/loader.ts` |
| Package manifest (`pi` field) | `packages/pi/src/resources/manifest.ts` |
| Discovery / settings | `packages/pi/src/resources/discovery.ts`, `packages/pi/docs/settings/index.md` |
| OpenAI Responses stream handler | `packages/ai/src/provider/openai/responses/index.ts` |
| `Api` type (`openai-responses`, `anthropic-messages`) | `packages/ai/src/protocol/ids.ts` |
| Reference package (workflows) | `packages/workflows/` |
| Package authoring standard | `packages/pi/docs/package/packages.md`, `docs/architecture/package-and-extension-authoring.md` |
