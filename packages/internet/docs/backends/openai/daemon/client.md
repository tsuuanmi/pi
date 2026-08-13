# backends/openai/daemon/client

Mirrors `src/backends/openai/daemon/client.ts`.

The HTTP client for the local ChatGPT Web daemon.

## `DaemonClientOptions`

```ts
interface DaemonClientOptions {
  config?: DaemonConfig;
  configDir?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
```

`config` short-circuits config reading; otherwise `configDir` is used. `fetch` and `timeoutMs`
(default `5000`) are injectable for tests.

## `DaemonClient`

Constructed privately; use the static factories.

- `DaemonClient.create(options?)` — reads daemon config (from `config` or `configDir`) and builds a
  client.
- `DaemonClient.forAccount(account, options?)` — reads the daemon config in the account's config
  dir and verifies the configured host/port match the account's endpoint. A mismatch raises
  `InternetError` (`config_invalid`).
- `baseUrl(includeVersion?)` — the endpoint URL, optionally with `/v1`.
- `health(signal?)` — `GET /healthz`, returns `DaemonHealth`.
- `compact(input, signal?)` — `POST /v1/responses/compact`, returns `CompactResponse`.
- `control(action, signal?)` — `POST /admin/<action>` with the bearer control token; returns the
  (possibly undefined) admin result.

### Request behavior

- Requests use a per-call timeout (`AbortSignal.timeout`), combined with the caller signal when one
  is provided.
- A network/transport failure raises `InternetError` `daemon_unavailable` with `retryable: true`.
- A non-2xx response raises `InternetError` `daemon_rejected` with the status and body; it is
  retryable for `409`, `429`, and `5xx`.
- `204` responses resolve to `undefined`; other responses are parsed as JSON.
