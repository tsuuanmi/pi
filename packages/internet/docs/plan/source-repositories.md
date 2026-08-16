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
| Provider-neutral Bun HTTP host | `src/core/server.ts` |
| Runtime paths / durable commands | `src/core/config.ts` |
| Process and service lifecycle | `src/core/process.ts`, `src/core/service.ts` |
| HTTP body limits | `src/core/http-body.ts` |
| ChatGPT loopback routes | `src/providers/chatgpt-web/server/routes.ts` |
| Responses SSE bridge + batch builder | `src/providers/chatgpt-web/protocol/responses/bridge.ts` |
| Request parsing (Responses → internal) | `src/providers/chatgpt-web/protocol/responses/parser.ts` |
| Responses schema / state / compaction | `src/providers/chatgpt-web/protocol/responses/{schema,state,compaction}.ts` |
| Reasoning envelope and error classification | `src/providers/chatgpt-web/protocol/responses/{reasoning-envelope,errors}.ts` |
| ChatGPT config / defaults / validation | `src/providers/chatgpt-web/lifecycle/config.ts` |
| Adapter types (`ParsedRequest`, `AdapterEvent`, `Usage`) | `src/providers/chatgpt-web/protocol/types.ts` |
| Native passthrough and wire transport | `src/providers/chatgpt-web/transport/` |
| Model catalog and route resolution | `src/providers/chatgpt-web/models/` |
| ChatGPT turn contract and execution | `src/providers/chatgpt-web/turn/` |
| **Browser automation and login** | `src/providers/chatgpt-web/browser/` |
| **Durable conversation state** | `src/providers/chatgpt-web/conversation/` |
| MCP and synthetic web-search tools | `src/providers/chatgpt-web/tools/` |
| Prompt, content, token, and usage conversion | `src/providers/chatgpt-web/content/` |
| Setup, doctor, connector, and control | `src/providers/chatgpt-web/lifecycle/` |
| Upstream Codex `config.toml` edits | Removed; Pi owns route and account configuration |
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
