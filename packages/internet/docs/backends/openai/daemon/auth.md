# backends/openai/daemon/auth

Mirrors `src/backends/openai/daemon/auth.ts`.

Daemon endpoint auth, base-URL, config-dir helpers, and config-file reading.

## Constants

- `DEFAULT_DAEMON_HOST` — `"127.0.0.1"`.
- `DEFAULT_DAEMON_PORT` — `17841`.

## `DaemonConfig`

```ts
interface DaemonConfig {
  host: string;
  port: number;
  controlToken: string;
  configDir: string;
}
```

The parsed daemon endpoint and admin control token.

## Helpers

- `getDaemonConfigDir(env)` — resolves the daemon config dir from `CODEX_CHATGPT_WEB_HOME`, falling
  back to `~/.codex-chatgpt-web`.
- `daemonBaseUrl(config, includeVersion?)` — builds `http://<host>:<port>` and appends `/v1` when
  `includeVersion` is true.
- `controlHeaders(controlToken)` — returns `{ authorization: "Bearer <token>" }` for admin routes.

## `readDaemonConfig`

```ts
readDaemonConfig(configDir = getDaemonConfigDir()): Promise<DaemonConfig>
```

Reads and strictly validates `<configDir>/config.json`. It requires the file to be
group/world-inaccessible (`mode & 0o077 === 0`), valid JSON, and to carry a non-empty loopback host
(`127.0.0.1`, `localhost`, or `::1`), an integer port in `1..65535`, and a control token matching
`^[A-Za-z0-9_-]{40,}$`. Failures raise `InternetError` with code `config_missing` (missing file) or
`config_invalid` (bad permissions, JSON, or fields).
