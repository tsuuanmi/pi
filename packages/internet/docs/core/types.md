# core/types

Mirrors `src/core/types.ts`.

Shared types used across the package.

## `InternetBackendId`

```ts
type InternetBackendId = "openai";
```

The currently supported backend. Only ChatGPT Web (`openai`) exists today.

## `InternetAccount`

```ts
interface InternetAccount {
  id: string;
  backend: InternetBackendId;
  displayName: string;
  configDir: string;
  host: string;
  port: number;
  enabled: boolean;
}
```

A fully-normalized account. `configDir` is the absolute private directory for daemon/browser data;
`host` is always the loopback host and `port` the loopback endpoint.

## `InternetAccountInput`

The account creation input. `backend`, `displayName`, `host`, `port`, and `enabled` are optional and
normalized with defaults by `AccountRegistry.add`. Only `id` and `configDir` are required.

## `InternetSettings`

```ts
interface InternetSettings {
  autoLogin: boolean;
}
```

The package settings, currently just the automatic-login toggle.

## `InternetControlAction`

```ts
type InternetControlAction = "drain" | "resume" | "shutdown" | "cancel-browser-turns";
```

The daemon admin actions accepted by `internet_control` and `DaemonClient.control`.
