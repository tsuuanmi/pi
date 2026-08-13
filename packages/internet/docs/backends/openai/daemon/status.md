# backends/openai/daemon/status

Mirrors `src/backends/openai/daemon/status.ts`.

Daemon status snapshots and the HUD provider.

## `DaemonStatus`

```ts
interface DaemonStatus {
  available: boolean;
  endpoint?: string;
  health?: DaemonHealth;
  error?: string;
}
```

## `readDaemonStatusSnapshot`

```ts
readDaemonStatusSnapshot(): Promise<DaemonStatus>
```

Resolves the default registry account, builds a `DaemonClient` for it, and reads its health. On
success returns `{ available: true, endpoint, health }`; on any error returns
`{ available: false, error }`.

## `readDaemonStatus`

An `ExtensionHudProvider`. Returns `undefined` when the daemon is unavailable or health is missing.
Otherwise it returns one HUD provider entry with the active turn count (`active_http_turns +
active_browser_turns`) as the `turns` chip and a `ready`/`draining` `state` chip derived from
`accepting_turns`.
