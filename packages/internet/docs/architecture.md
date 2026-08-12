# Internet Architecture

This document is the detailed architecture for the `internet` Pi package. It assumes familiarity
with how codex-chatgpt-web itself is built (the standalone bridge in
`/home/superman/workspaces/codex-chatgpt-web`). `internet` reuses that engine and exposes it to Pi.

> **Source:** read the engine at `/home/superman/workspaces/codex-chatgpt-web/src` (`server.ts`,
> `bridge.ts`, `responses/parser.ts`, `adapters/chatgpt-web/index.ts`, `turn-broker.ts`,
> `environment.ts`, `prompt.ts`). See [source-repositories.md](source-repositories.md) for the full map.

> **MVP scope note:** start with [MVP Review & Brainstorm](review-and-brainstorm.md). The MVP is
> **model routing only** — register the daemon as a Pi `openai-responses` provider plus a thin tool
> surface. The full-mode **tool bridge** described in §4–§5 and the Codex / Claude Code backends are
> **post-MVP** work, not part of the first milestone.

---

## 1. Positioning

There are two ways to bring codex-chatgpt-web's features to Pi:

| Shape | What it is | Effort | When to choose |
|-------|-----------|--------|----------------|
| **Wrapper** | `internet` talks to the running bridge over its loopback HTTP API (`127.0.0.1:17841`). Pi tools `POST` Responses payloads and read the SSE stream. | Low | Recommended. Reuses the battle-tested bridge unchanged. |
| **Embedded** | Port the adapter/broker/browser-worker logic directly into Pi tools. | High | Only if the daemon lifecycle can't be managed separately. |

`internet` is a **wrapper**. The daemon is launched/managed by the package (or by the existing
`codex-chatgpt-web` service), and Pi talks to it over HTTP.

### Why wrapper

- The bridge already solves the hard problems: Responses→prompt compilation, DOM streaming,
  turn broker token/binding security, reversible Codex `config.toml` edits, compaction, and
  rolling checkpoints.
- Pi's job is the *agent surface*: tools, hooks, a skill, and daemon control — not re-implementing
  browser automation.
- The security posture (untrusted model, approved tool access, trusted environment) stays intact
  because the wrapper never bypasses the bridge's enforcement.

---

## 2. System context

```
┌───────────────────────────────  Pi host  ──────────────────────────────────────┐
│                                                                                │
│  ┌──────────────┐   registers   ┌──────────────────────────────────────────┐   │
│  │  Pi agent    │ ◄────────────►│  internet extension (default export)     │   │
│  │  (model loop)│               │  tools · hooks · skill · HUD provider    │   │
│  └──────┬───────┘               └──────────────┬───────────────────────────┘   │
│         │ tool_call / tool result              │ HTTP                         │
└─────────┼──────────────────────────────────────┼──────────────────────────────┘
          │                                      ▼
          │                     ┌───────────────────────────┐
          │      loopback       │  codex-chatgpt-web daemon  │
          │      Responses API  │  127.0.0.1:17841           │
          └────────────────────►│  server.ts (Bun.serve)     │
                                └─────────────┬─────────────┘
                                              │ full mode only (broker socket)
                                              ▼
                                      ┌───────────────────┐   unix socket
                                      │ TurnBroker        │ ◄──────► MCP server (stdio)
                                      │ token/binding     │          codex_* tools
                                      └───────────────────┘
```

The `internet` package does **not** talk to chatgpt.com directly. It drives the daemon, which
drives Chrome. This keeps one owner of the sensitive browser/session state.

---

## 3. Core components

| Component | Responsibility | Files (proposed) |
|-----------|----------------|------------------|
| **Core domain contracts** | Backend-agnostic types ported from codex-chatgpt-web: `CodexParsedRequest`, `CodexContext`, `CodexMessage`, `AdapterEvent`, `CodexUsage`, `ProviderAdapter`. | `src/core/types.ts`, `src/core/adapter.ts`, `src/core/errors.ts` |
| **Backend seam** | `InternetBackend` interface: `providerName`, `api`, `register(pi, accounts)`. One implementation per backend. | `src/backends/backend.ts` |
| **OpenAI backend (MVP)** | ChatGPT Web via the codex-chatgpt-web daemon. Registers the daemon as a Pi `openai-responses` provider. | `src/backends/openai/{index,provider,models}.ts` |
| **Daemon client** | Thin HTTP client over the daemon's Responses routes (`/v1/models`, `/v1/responses`, `/v1/responses/compact`, `/admin/*`). | `src/backends/openai/daemon/client.ts` |
| **Turn adapter** | Maps a Pi tool invocation to a Responses request and streams the result back as tool output. | `src/backends/openai/turn/adapter.ts` |
| **Anthropic backend (future)** | Claude via `anthropic-messages`. Stub. | `src/backends/anthropic/` |
| **Google backend (future)** | Gemini via OpenAI-compat. Stub. | `src/backends/google/` |
| **Account registry** | Multi-account mapping (id/backend/displayName/port/configDir/enabled). | `src/accounts/registry.ts` |
| **Cross-backend tools** | `internet_accounts`, `internet_status`, `internet_compact`, `internet_control`. | `src/tools/` |
| **Hooks** | Lifecycle hooks (`turn_end`, `tool_call`) that guard tool access. | `src/hooks.ts` |

---

## 4. Request path

A Pi agent runs a Codex turn through ChatGPT Web:

1. The agent selects a ChatGPT Web model (`gpt-5.6-sol` / `gpt-5.6-luna`) via the registered
   provider; Pi's `openai-responses` handler builds the Responses request.
2. `backends/openai/turn/adapter.ts` builds a Responses payload: `{ model, input: [...], stream: true }`.
3. `backends/openai/daemon/client.ts` `POST`s it to `/v1/responses` with the Bearer token and streams the SSE
   response.
4. The daemon runs the whole bridge (see `docs/architecture-deep-dive.md` for the engine): parse →
   adapter → prompt compile → browser turn → SSE bridge.
5. `adapter.ts` converts SSE frames back into incremental tool output (text deltas, reasoning,
   tool calls) for the Pi agent.

For **full mode**, the loop continues:

- The turn's `turn_token` and environment come back to Pi via a `codex_*` bridge tool.
- The agent (or a follow-up) calls `codex_tool_call` with that token + wire name.
- `internet` forwards it as a `function_call` in the next Responses turn, or calls the daemon
  control surface; the broker validates the token/binding and delivers it to the Codex round.

---

## 5. Data model

The package carries a small amount of durable state, persisted under
`<config-dir>/internet/`:

| Path | Contents |
|------|----------|
| `runtime.json` | Daemon endpoint, control token reference, mode, broker socket path. |
| `state.json` | Last-known daemon status (`/healthz` snapshot: active turns, draining). |
| `sessions/<thread-id>.json` | Per-thread turn state for replay/dedup (mirrors the daemon's replay cache). |

No ChatGPT cookies or tokens are stored by `internet` itself — those live in the daemon's config
dir. The package only holds the control token needed to talk to the loopback daemon.

---

## 6. Security model

The package inherits the bridge's model and must not weaken it:

| Boundary | Enforcement |
|----------|-------------|
| Loopback only | Daemon binds `127.0.0.1`; `internet` refuses to configure any other host. |
| Daemon auth | Every daemon call sends the `controlToken` (Bearer); constant-time check in the daemon. |
| Untrusted model | The model's answers never grant authority; `internet` derives it from the trusted environment and per-turn tool registry. |
| Tool approval | The `tool_call` hook blocks `codex_*` invocations unless a human approves (mirror `autoApproveToolCalls=false`). |
| Secrets | The control token is read from a 0600 file; never logged; diagnostics redacted. |
| Config integrity | The daemon's reversible Codex `config.toml` edits are left untouched by the wrapper. |

The strongest control is the connector approval gate. `internet` maps that to Pi's `tool_call`
hook so an agent cannot invoke a bridged native tool without policy approval.

---

## 7. Non-goals

- `internet` does **not** re-implement browser automation, DOM parsing, or the Responses SSE
  framing — those stay in the daemon.
- It does **not** store ChatGPT credentials or browser state.
- It does **not** edit `~/.codex/config.toml` directly; it only reads daemon status and forwards
  requests.
