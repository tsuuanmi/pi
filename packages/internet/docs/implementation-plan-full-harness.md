# Internet — Implemented Plan: Full Harness and Local File Access

Source-grounded implementation for making `@file` useful immediately and enabling the daemon's real
local MCP/tool bridge when the required OpenAI tunnel infrastructure is available.

> Status: **implemented.** Safe inline `@file` expansion works in browser-only mode. Full harness
> configuration/lifecycle is implemented for an externally installed tunnel client and requires a
> one-time ChatGPT connector setup.

## Source review

### Daemon: authoritative Full harness

The vendored daemon already contains the correct live-tool architecture:

- `config.ts`: `RuntimeMode = "browser-only" | "full"`; Full mode advertises local tools.
- `turn-broker.ts`: account-local Unix socket for turn-scoped claim/invoke/resolve/release.
- `mcp-server.ts`: the existing `codex-native` MCP implementation.
- `tunnel.ts`: launches the external tunnel client and points it at the daemon's MCP command.
- `setup.ts`: documents the OpenAI tunnel ID, runtime key, and ChatGPT connector prerequisites.

The package does **not** duplicate this MCP server or broker.

### Prometheus: useful static file references

Prometheus's `mcp-server.js` reads explicitly referenced files and inserts their contents into the
message. This is simple and works without a live tool bridge, but it is not live filesystem access.

### Pi: existing workspace/session authority

Pi already owns cwd and request conversion. The package therefore resolves file references only
after Pi conversion and before turn metadata adaptation.

## Implemented design

### Safe inline `@file` expansion

`src/backends/openai/turn/files.ts` expands explicit relative references in the active user message:

```text
Overview @README.md and @docs/architecture.md
```

Security boundary:

- current workspace only (realpath checked; symlink escape rejected);
- hidden paths and `..` traversal rejected;
- regular UTF-8 text files only;
- maximum 5 files, 128 KiB each, 256 KiB total;
- deterministic generated markup; retries are idempotent.

This works in browser-only mode and gives the model static file contents immediately. Referenced
contents are sent to ChatGPT's external service; users must not reference secrets or files that
should remain local.

### Full harness account configuration

`src/daemon/harness.ts` owns account-scoped `harness.json`:

- `browser-only`, or
- `full` with tunnel client executable path, OpenAI tunnel ID, and a private runtime-key file path.

`internet_harness enable` accepts **paths and a non-secret tunnel ID only**. It copies key bytes from
an existing file into account-private `0600` storage; secret key text never enters Pi session
history.

### Full harness lifecycle

- Generated daemon config switches to `mode: "full"` and includes tunnel settings.
- The package starts the daemon first so its broker socket exists, then invokes the vendored
  `tunnel connect` command.
- The vendored tunnel launches the existing MCP command against that broker.
- Daemon shutdown (manual or idle) disconnects the tunnel runtime.
- `internet_harness disable` returns to browser-only mode and restarts the account daemon.

### External prerequisites

The bundled runtime does not include a tunnel client and upstream Linux service installation is not
implemented. Full mode therefore requires:

1. an externally installed compatible tunnel-client executable;
2. an existing OpenAI `tunnel_<32 hex>` ID;
3. a Tunnels Read+Use runtime-key file;
4. one-time creation/connection of the `Codex Native2` connector in ChatGPT settings.

The package validates these inputs and fails closed; it does not download binaries or invent
credentials.

## User flow

```text
internet_harness enable
  tunnelClientPath: /absolute/path/to/tunnel-client
  tunnelId: tunnel_<32 lowercase hex>
  runtimeKeyFile: /absolute/path/to/private-key-file
```

Then complete the one-time connector step in ChatGPT if reported. Use `internet_harness status` to
confirm the configured mode. Local `codex_*` tool calls remain approval-gated by the package hook.
Because the repeated per-turn read-only warning is removed in browser-only mode, Full-harness
onboarding is surfaced instead through `internet_harness status`/`enable` and the one-time connector
guidance, so the upgrade path stays discoverable without noisy per-turn output.

## Verification

- Browser-only: `Overview @README.md` includes file contents and can be summarized.
- Full mode: daemon starts, tunnel reports ready, connector is visible, and a read/exec/patch call is
  approval-gated and resolved through the existing broker/MCP path.
- Disabling Full mode restarts cleanly in browser-only mode.
- Package/runtime build, tests, Biome, and root `tsgo` pass.
