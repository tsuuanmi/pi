# Internet — MCP, Tunnel, and the Turn Broker (Full Mode)

This document explains the **MCP**, **Tunnel**, and **turn broker** machinery that the vendored
`codex-chatgpt-web` daemon ships, and how the `internet` package uses it for **Full mode** (local
file/tool access). It is grounded in the actual vendored source.

> Status: **reference + direction.** This is a detail/explanation doc that also records the agreed
> direction: **Full harness is a desired option** (not just a reference). The package will support
> Full mode (local file/tool access) as a first-class, opt-in capability alongside browser-only mode.

---

## 1. The three pieces, in one sentence each

- **Turn broker** — a local Unix socket that lets a separate process (the MCP server) hand a
  browser turn to the daemon and get the result back.
- **MCP server** — a Model Context Protocol server that exposes the daemon's browser turn as a
  tool, so a client (Codex, or a Full-mode harness) can call it.
- **Tunnel** — a remote bridge (`tunnel-client`) that connects a local daemon to a remote Codex
  runtime, so the remote runtime can drive the local browser and local tools.

---

## 2. The turn broker

Source: `src/adapters/chatgpt-web/turn-broker.ts`.

The turn broker is a **local Unix socket** (default `$CODEX_CHATGPT_WEB_HOME/runtime/turn-broker.sock`)
that decouples the browser turn from the HTTP server. It lets a separate process (the MCP server)
submit a turn and receive the result without going through the daemon's HTTP `/v1/responses` path.

- `defaultBrokerEndpoint()` / `resolveBrokerEndpoint()` (in `src/config.ts`) compute the socket path.
- The broker is how the **MCP server** talks to the daemon: the MCP server connects to the broker
  socket, sends a turn, and gets the browser result.

Why it exists: the daemon's HTTP server is the Pi-facing inference path. The broker is a second,
lower-level path used by the MCP server so a tool-capable client can drive the same browser.

---

## 3. The MCP server

Source: `src/adapters/chatgpt-web/mcp-server.ts` and `mcp-main.ts`.

The daemon ships an **MCP server** that exposes the ChatGPT Web browser turn as an MCP tool. It is
launched via `codex-chatgpt-web mcp --broker-socket <path>` (see `mcp-main.ts`).

- `runChatGptMcpMain(args)` parses `--broker-socket` and calls `runChatGptMcpServer({ brokerSocketPath })`.
- The MCP server connects to the turn broker socket and serves the browser turn as an MCP tool.
- This is what lets a **Codex runtime** (or a Full-mode harness) call the browser as a tool over MCP.

The MCP server is the bridge between the **MCP protocol** (client ↔ server) and the **turn broker**
(server ↔ daemon browser).

---

## 4. The tunnel

Source: `src/tunnel.ts` and `src/tunnel-service.ts`.

The tunnel is a **remote bridge** that connects a local daemon to a remote Codex runtime. It uses a
downloaded `tunnel-client` binary (from a release asset, checksum-verified) and a **runtime key**.

### 4.1 The tunnel client

- `installTunnelClient()` downloads `tunnel-client` from a release, verifies its SHA-256 against
  `SHA256SUMS.txt`, and installs it under `$CODEX_CHATGPT_WEB_HOME/bin/`.
- `installRuntimeKey()` / `installRuntimeKeyBytes()` store the runtime key under
  `$CODEX_CHATGPT_WEB_HOME/secrets/tunnel-runtime.key` (0600).
- `createTunnelConfig()` builds a `TunnelConfig` with `tunnelId` (must match
  `^tunnel_[a-f0-9]{32}$`), `profileName`, `alias`, and `profileDir`.

### 4.2 Connecting the tunnel

- `connectTunnel(config)` runs `tunnel-client runtimes connect` with:
  - `--tunnel-id <id>`
  - `--runtime-api-key file:<runtimeKeyFile>`
  - `--mcp-command <mcpCommand>` — the command that starts the MCP server
    (`codex-chatgpt-web mcp --broker-socket <path>`).
- `mcpCommand(config)` builds that command, quoting it for the platform.

So the tunnel connects a **remote Codex runtime** to the **local daemon's MCP server**, which in
turn drives the **local browser** via the **turn broker**. The remote runtime can then use the local
browser and local tools as if they were local.

### 4.3 Full mode requires the tunnel

`tunnel(config)` throws unless `config.mode === "full"` and `config.tunnel` is set. So the tunnel is
the mechanism that enables **Full mode** (local file/tool access), as opposed to **browser-only**
mode.

---

## 5. How the package uses this (Full harness)

The `internet` package exposes this through `internet_harness` (see `src/daemon/harness.ts` and
`docs/daemon/harness.md`).

- **Browser-only mode** (default): no tunnel, no MCP. The daemon serves `/v1/responses` only.
- **Full mode**: the user supplies a `tunnelClientPath`, `tunnelId`, and `runtimeKeyFile`. The
  package validates them (executable binary, `tunnel_` + 32 hex id, non-empty key ≤ 64 KiB), copies
  the key to `<configDir>/secrets/tunnel-runtime.key` (0600), and writes the harness config
  atomically.

The package does **not** re-implement the tunnel or MCP server — it configures and drives the
daemon's own machinery. The daemon owns the tunnel client, the MCP server, and the turn broker.

### Full harness is a desired option

Full harness is a **first-class, opt-in capability** the package wants, not a reference-only
concept. It is the path to **local file/tool access** (`codex_tool_call`, `codex_exec`,
`codex_write_stdin`, `codex_apply_patch`) through the daemon's broker/MCP/tunnel machinery.

- **Browser-only** stays the default and needs none of the tunnel/MCP/broker machinery.
- **Full mode** is enabled explicitly per account via `internet_harness` and is approval-gated
  (local tool calls require the `tool_call` approval hook).
- The package drives the daemon's own tunnel/MCP/broker; it never re-implements them.

This is the agreed direction: Full harness is a **wanted feature** (see
`plan/features-brainstorm.md` §2.5 and `review/architecture-review.md` R7), sequenced after the
core model path is solid.

---

## 6. Security model

| Boundary | Enforcement |
|----------|-------------|
| Tunnel id | Must match `^tunnel_[a-f0-9]{32}$` |
| Runtime key | Non-empty, ≤ 64 KiB, stored 0600 under a 0700 dir |
| Tunnel client | Downloaded with SHA-256 verification against `SHA256SUMS.txt` |
| Broker socket | Local Unix socket under the account's private runtime dir |
| MCP command | Quoted per platform; no newlines allowed in command values |
| Full mode | Only enabled explicitly via `internet_harness`; browser-only is the default |

---

## 7. Bottom line

- **Turn broker** = local socket that lets the MCP server drive the daemon's browser.
- **MCP server** = exposes the browser turn as an MCP tool to a client (Codex / Full harness).
- **Tunnel** = remote bridge that lets a remote Codex runtime drive the local browser + local tools.
- The package **configures and drives** the daemon's own tunnel/MCP/broker machinery; it does not
  re-implement it.
- **Full harness is a desired, first-class opt-in option** — the path to local file/tool access,
  approval-gated, sequenced after the core model path.
- **Full mode** = browser-only + tunnel + MCP, enabling local file/tool access. Browser-only is the
  default and needs none of this.
