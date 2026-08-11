# Internet — How It Works

This document walks the runtime flow of the `internet` package, from a Pi agent tool call to the
ChatGPT Web result streamed back into the agent. It complements `architecture.md` (the design) and
`pi-integration.md` (the ecosystem wiring).

---

## 1. Startup / discovery

1. Pi loads the package and calls its default export (see `pi-integration.md`).
2. The extension registers tools, hooks, and a HUD provider.
3. The **daemon client** reads `runtime.json` to locate the loopback daemon (`127.0.0.1:17841`)
   and the control token.
4. If the daemon is not running, the package offers to start it (or surfaces a clear error telling
   the user to run `codex-chatgpt-web`). It does **not** silently skip the health check.

---

## 2. A Codex turn through ChatGPT Web

The main path: the agent runs `codex_turn`.

```
agent ──tool_call──► codex_turn (tools/codex-turn.ts)
        │  build Responses payload
        ▼
daemon/client.ts  POST /v1/responses { model, input, stream:true }
        │  Bearer controlToken
        ▼
daemon (server.ts → parseRequest → adapter.runTurn)
        │  prompt compile → browser turn → DOM streaming
        ▼
SSE: response.created / output_text.delta / ... / response.completed
        │  adapter.ts converts frames → incremental tool output
        ▼
tool result text (and optional tool_call for full mode) back to Pi agent
```

### 2.1 The SSE → tool-output mapping

`turn/adapter.ts` subscribes to the daemon's SSE stream and emits:

| SSE frame | Pi tool output |
|-----------|----------------|
| `response.output_text.delta` | text delta |
| `response.reasoning_summary_text.delta` | reasoning/thinking delta |
| `response.function_call_arguments.delta` | tool-call argument delta |
| `response.output_item.done` (message/tool_call) | committed item |
| `response.completed` | final result, stopReason `stop` |
| `response.incomplete` / `response.failed` | terminal error state |

The adapter buffers and dedups so reconnects don't duplicate text.

---

## 3. Full mode: the tool bridge loop

When the turn is tool-capable, the model may call `codex_*` tools. The daemon embeds a
`turn_token` in the prompt and mints a per-turn `bindingId` when the turn is claimed.

```
Pi agent
   │ calls codex_tool_call({ turn_token, wire_name, arguments })
   ▼
tools/codex-tool-call.ts  → POST /v1/responses with a function_call item
   ▼
daemon → broker.claim(token) → broker.invoke(bindingId, wire_name)
   │   validates wire name against this turn's tool registry
   ▼
queued to the active Codex round → nextToolBatch → tool result → completeTool
   ▼
SSE back to Pi → adapter streams the tool result
```

The **`tool_call` hook** (in `hooks.ts`) sits in front of these tools and requires human approval
before a bridged native tool runs — the Pi analogue of the daemon's connector confirmation dialog.

---

## 4. Compaction

Long tasks stay inside the context window by running `codex_compact`, which wraps the daemon's
`/v1/responses/compact` endpoint:

1. The agent calls `codex_compact({ model, input })`.
2. The daemon runs a **dedicated summarization turn** that never binds the tool bridge.
3. The returned summary becomes the next turn's replacement history.
4. `internet` returns the summary to the agent and records it in the thread's session state for
   `previous_response_id` replay.

Luna (free tier) instead uses the daemon's **rolling checkpoint** on every completed turn, so
`internet` disables separate compaction for Luna just like the daemon does.

---

## 5. Control plane

`internet` exposes control tools that map to the daemon's `/admin/*` routes:

| Tool | Daemon route | Effect |
|------|--------------|--------|
| `daemon_drain` | `POST /admin/drain` | Stop accepting new turns. |
| `daemon_resume` | `POST /admin/resume` | Resume accepting turns. |
| `daemon_shutdown` | `POST /admin/shutdown` | Refuse while active, else shut down. |
| `daemon_status` | `GET /healthz` | Live turn counts, mode, draining. |

All admin calls require the control token. `daemon_shutdown` is refused (HTTP 409) when there are
active turns — the daemon enforces this, and `internet` surfaces it.

---

## 6. Lifecycle / durability

- **Replay & dedup**: `turn/replay.ts` keys turns by thread id and reuses a settled outcome on
  reconnect instead of re-running the browser (mirrors the daemon's own replay cache).
- **Graceful close**: on Pi shutdown, `internet` drains and closes, never abandoning an in-flight
  browser turn.
- **State**: written atomically to `<config-dir>/internet/` (0600), never containing cookies or
  model tokens.

---

## 7. Error handling

| Failure | Behavior |
|---------|----------|
| Daemon down | Clear error: start the service first; no partial run. |
| Daemon busy / draining | 503 from the daemon surfaced as a retryable tool error. |
| Tool not advertised in this turn | The daemon's `validateBatchTools` rejects it; `internet` relays the precise message. |
| Stream interrupted | Adapter resumes from the last committed item or fails terminal with `reason`. |
| Turn token expired/revoked | The broker returns a precise "turn already finished" error; surfaced verbatim. |
