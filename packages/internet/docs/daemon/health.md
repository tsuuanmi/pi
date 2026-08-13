# daemon/health

Mirrors `src/daemon/health.ts`.

Startup health polling.

## `WaitForHealthOptions`

```ts
interface WaitForHealthOptions {
  timeoutMs?: number; // default 30_000
  intervalMs?: number; // default 200
}
```

## `waitForDaemonHealth`

```ts
waitForDaemonHealth(client: Pick<DaemonClient, "health">, options?): Promise<void>
```

Polls `client.health()` every `intervalMs` until it succeeds or the `timeoutMs` deadline is reached.
On timeout it throws `"ChatGPT Web daemon did not become healthy before the startup timeout."` with
the last error as cause.
