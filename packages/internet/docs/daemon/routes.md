# daemon/routes

Mirrors `src/daemon/routes.ts`.

Shared daemon route constants and request/response payload shapes. Compact and conversation-canary
routes are exposed only by adapters that implement those capabilities.

## `DAEMON_ROUTES`

```ts
const DAEMON_ROUTES = {
  health: "/healthz",
  compact: "/v1/responses/compact",
  conversationCanary: "/admin/conversation-canary",
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
  active_adapter_turns: number;
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
