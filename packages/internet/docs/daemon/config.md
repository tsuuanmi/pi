# daemon/config

Mirrors `src/daemon/config.ts`.

Package-owned browser daemon configuration, login markers, capabilities, and private atomic writes.

## Browser provider configs

`OwnedDaemonConfig` is discriminated by `adapter`:

- `chatgpt-web` supports browser-only or Full mode, owns the turn broker/tunnel fields, and records
  `proAvailable`.
- `gemini-web` is browser-only, has no broker/tunnel/MCP fields, uses a conservative 32,000-token
  context limit, and stores its verified capability marker at `<configDir>/capabilities.json`.

Both own a loopback endpoint, isolated Chrome/storage paths, headed window settings, conversation
state directory, idle shutdown, control token, bundled runtime command, and acknowledgement time.
Unknown or cross-provider fields are rejected.

## Capabilities and login

`daemonLoginMarkerPath(account)` selects the provider marker path. ChatGPT retains its version-2
storage verification marker. Gemini requires a version-1 marker with the exact Google
`SignOutOptions` authenticated anchor and nested labels/availability for Flash, Thinking, and Pro.
`readOwnedDaemonCapabilities()` exposes only models present in that verified Gemini marker.

`daemonLoginExists()` requires both private browser storage and the matching valid provider marker.
`syncOwnedDaemonCapabilities()` updates ChatGPT's config flag; Gemini capabilities remain marker-owned.

## Security

`defaultChromeExecutable()` resolves supported system Chrome paths. `ensureOwnedDaemonConfig()`
creates or validates the canonical provider config, enforces unique account loopback endpoints, and
writes `0700` directories and `0600` files atomically. Control tokens must match
`^[A-Za-z0-9_-]{40,}$`.
