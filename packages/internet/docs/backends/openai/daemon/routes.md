# backends/openai/daemon/routes

Mirrors `src/backends/openai/daemon/routes.ts`.

Daemon route constants and request/response payload shapes.

## `DAEMON_ROUTES`

```ts
const DAEMON_ROUTES = {
  health: "/healthz",
  compact: "/v1/responses/compact",
  control: {
    drain: "/admin/drain",
    resume: "/admin/resume",
    shutdown: "/admin/shutdown",
    "cancel-browser-turns": "/admin/cancel-browser-turns",
  },
};
```

## `DaemonHealth`

```ts
interface DaemonHealth {
  status: "ok";
  config_fingerprint: string;
  accepting_turns: boolean;
  active_http_turns: number;
  active_browser_turns: number;
}
```

## `CompactRequest` / `CompactResponse`

```ts
interface CompactRequest {
  model: string;
  input: unknown[];
  instructions?: string;
}

interface CompactResponse {
  output: unknown[];
}
```
