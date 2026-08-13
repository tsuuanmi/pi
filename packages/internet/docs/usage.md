# Internet — Usage Guide

This package makes ChatGPT Web available to Pi and adds tools for web access, local files, daemon
lifecycle, accounts, and (optionally) Full-harness local tools. This guide explains what is available
now, how to invoke each tool, and what is needed for the more advanced local-tools mode.

Two groups exist:

- **Immediately usable** — works in the default browser-only mode with no external setup:
  `@file` references, `internet_search`, `internet_fetch`, and the lifecycle/account/status tools.
- **Full harness local tools** — the model-side `codex_*` tools that surface only after you enable
  Full mode with an external tunnel client and a one-time ChatGPT connector. They are
  approval-gated and require real prerequisites.

---

## 1. Immediately usable (browser-only mode)

### 1.1 Local file contents: `@file` references

Mention a workspace-relative path with `@` in the active message and the package inlines the file
contents before the turn reaches ChatGPT:

```text
Summarize @README.md
Compare @docs/architecture.md and @docs/layout.md
```

Rules (enforced and fail-closed):

- workspace-local regular UTF-8 text files only;
- hidden paths and `..` traversal rejected;
- symlinks escaping the workspace rejected;
- at most 5 files, 128 KiB each, 256 KiB total;
- retries are idempotent.

Ordinary mentions such as `@alice` (no resolvable file) are left as literal text and do not block the
request. **Privacy:** referenced contents are sent to ChatGPT; do not reference secrets or files that
should not leave the machine.

### 1.2 Web search and fetch

| Tool | Purpose | Example |
|------|---------|---------|
| `internet_search` | Search the public web, returns source URLs + snippets | `internet_search(query: "pi agent framework", limit: 5)` |
| `internet_fetch` | Fetch readable text from a public HTTP(S) URL | `internet_fetch(url: "https://example.com/docs")` |

`internet_fetch` is SSRF-aware: it blocks URL credentials, non-HTTP schemes, private/reserved
destinations, unsafe redirects, binary responses, oversized bodies, and long-running requests.

### 1.3 Lifecycle, status, accounts, settings

| Tool | Purpose | Examples |
|------|---------|----------|
| `internet_status` | Show daemon health + active turn counts | `internet_status()` |
| `internet_daemon` | Log in, start, stop, restart, inspect the owned daemon | `internet_daemon(action: "status")`, `internet_daemon(action: "login")` |
| `internet_control` | Drain/resume/shutdown/cancel browser turns | `internet_control(action: "drain")`, `internet_control(action: "cancel-browser-turns")` |
| `internet_compact` | Compact conversation history | `internet_compact(instructions: "keep the requirements")` |
| `internet_settings` | Inspect/update settings (`autoLogin`) | `internet_settings()`, `internet_settings(autoLogin: false)` |
| `internet_accounts` | List configured accounts | `internet_accounts()` |
| `internet_account_add` | Add a daemon account (reload Pi after) | `internet_account_add(displayName: "work", port: 17842)` |
| `internet_account_set_enabled` | Enable/disable an account (reload Pi after) | `internet_account_set_enabled(id: "default", enabled: true)` |
| `internet_doctor` | Run account-scoped daemon diagnostics | `internet_doctor()` |
| `internet_harness` | Inspect/configure Full harness mode | `internet_harness(action: "status")` |

Approval-gated interactive tools: `internet_daemon`, `internet_control`, and `internet_harness`
require interactive approval (a `tool_call` approval prompt) before they run. In a non-interactive
(`--print`) context they are blocked with a reason.

---

### Conversation modes and research agents

Accounts default to `temporary`: every turn uses an isolated Temporary Chat and replays Pi's canonical
context. Use `internet_account_conversation_mode` to select `durable` for a browser-only research
account. Durable mode maps the account and stable Pi session ID to one normal `chatgpt.com/c/<id>`
conversation and sends only the verified unsynchronized history suffix. Persistent subagents have
their own Pi session IDs, so each researcher receives an independent ChatGPT conversation.

Durable mode remains fail-closed until `internet_conversation` runs the explicitly confirmed retained-chat
canary and records a private authority receipt for the exact bundled runtime. `internet_conversation`
also reports authority status and resets bindings after stopping the daemon. Missing or stale authority, retries, edited/rewound history, uncertain submit
outcomes, wrong-account state, and image attachments are rejected before another browser submit.
Full harness always uses Temporary Chat.

The bundled Workflows `researcher_spawn` tool uses an explicitly registered ChatGPT Web model and a
persistent read-only `researcher` profile. ChatGPT-native browsing is separate from Pi's
`internet_search` and `internet_fetch` tools: ordinary Pi agents may call those tools, while
browser-only ChatGPT cannot invoke them directly.

## 2. Full harness local tools (`codex_*`)

Full mode gives the model **live local tool access** through the daemon's `codex-native` MCP server
and turn broker. This is the mode that makes ChatGPT act like a tool-capable Codex harness.

### 2.1 Prerequisites (required, external)

The bundled runtime does not include a tunnel client and Linux service install is not implemented, so
you must supply:

1. an externally installed compatible tunnel-client executable;
2. an existing OpenAI `tunnel_<32 lowercase hex>` ID;
3. a Tunnels Read+Use runtime-key file (key bytes are read from the file and copied into private
   `0600` storage — the secret text never enters Pi history);
4. one-time creation/connection of the `Codex Native2` connector in ChatGPT settings.

### 2.2 Enabling Full mode

```text
internet_harness enable
  tunnelClientPath: /absolute/path/to/tunnel-client
  tunnelId: tunnel_<32 lowercase hex>
  runtimeKeyFile: /absolute/path/to/private-key-file
```

The package validates the inputs (executable exists and is runnable; key file is a non-empty regular
file ≤ 64 KiB; tunnel ID matches `tunnel_[a-f0-9]{32}`), copies the key into account-private storage,
writes `harness.json` under the account config dir, restarts the account daemon in `full` mode, and
connects the tunnel. If ChatGPT reports connector setup, complete the one-time `Codex Native2`
connector step in ChatGPT settings.

Confirm with:

```text
internet_harness action: status   # -> { mode: "full", connectorSetupRequired: true }
```

### 2.3 The local tools that become available to the model

| Tool | Purpose |
|------|---------|
| `codex_exec` | Run a native Codex command; long-running commands return a `session_id` |
| `codex_write_stdin` | Write to / poll a session returned by `codex_exec` |
| `codex_apply_patch` | Apply a native Codex patch |
| `codex_view_image` | View an image through native Codex |
| `codex_tool_inventory` | Discover the exact tool names available from the current Codex harness |
| `codex_tool_call` | Invoke an exact `wire_name` returned by `codex_tool_inventory` |

These tools surface during model turns through the broker/MCP path. `codex_tool_call`,
`codex_exec`, and `codex_apply_patch` are **approval-gated** by the package's `tool_call` hook: every
call requires interactive approval, and non-interactive contexts are blocked. In browser-only mode
these calls are inert; they become reachable only in Full mode.

### 2.4 Disabling Full mode

```text
internet_harness action: disable   # returns to browser-only and restarts the daemon
```

Disabling removes the private runtime-key copy and restarts the account cleanly in browser-only mode.

---

## 3. Tool availability summary

| Tool | Mode | Approval | External setup |
|------|------|----------|----------------|
| `@file` references | browser-only + full | no | no |
| `internet_search`, `internet_fetch` | browser-only + full | no | no |
| `internet_status`, `internet_compact`, `internet_settings` | both | no | no |
| `internet_accounts` family | both | no | no |
| `internet_daemon`, `internet_control`, `internet_harness` | both | yes | no |
| `codex_exec`, `codex_tool_call`, `codex_apply_patch` | full only | yes | yes |
| `codex_write_stdin`, `codex_view_image`, `codex_tool_inventory` | full only | invoked via `codex_exec`/`codex_tool_call` (not direct Pi tools) | yes |

---

## 4. Quick-start examples

```text
# Web research without local tools
internet_search(query: "Rust async runtime comparison")
internet_fetch(url: "https://example.org")

# Give the model static file context in browser-only mode
"Review the error-handling in @src/backends/openai/provider.ts and propose improvements"

# Health / lifecycle
internet_status()
internet_doctor()
internet_daemon(action: "status")

# Local tools (requires Full harness setup)
internet_harness(action: "enable",
  tunnelClientPath: "/usr/local/bin/tunnel",
  tunnelId: "tunnel_<32 hex>",
  runtimeKeyFile: "/home/me/secrets/runtime.key")
internet_harness(action: "status")
```

---

## 5. Limitations and notes

- Full harness connector setup and tunnel credentials remain external prerequisites; the package
  never downloads binaries or invents credentials.
- Non-interactive (`--print`) contexts cannot approve the approval-gated tools or the `codex_*`
  bridge.
- Full-harness `codex_*` tool calls are the only live local-tool path; static `@file` contents work
  in both modes but are not live filesystem access.
