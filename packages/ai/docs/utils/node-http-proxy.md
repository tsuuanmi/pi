# Node HTTP Proxy

HTTP proxy configuration for Node.js environments.

## `resolveHttpProxyUrlForTarget()`

```typescript
import { resolveHttpProxyUrlForTarget } from "@tsuuanmi/pi-ai";
```

Resolves the proxy URL to use for a given target URL, consulting `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` (and `NO_PROXY` for exclusions). Returns `undefined` when no proxy applies. Only `http:` and `https:` proxy protocols are supported; SOCKS and PAC URLs are rejected.

```typescript
const proxyUrl = resolveHttpProxyUrlForTarget("https://api.anthropic.com/v1/messages");
if (proxyUrl) {
  // proxyUrl is a URL instance pointing at the HTTP(S) proxy
}
```

Accept an optional `env` (`ProviderEnv`) to scope proxy resolution to a single request, overriding `process.env`:

```typescript
const proxyUrl = resolveHttpProxyUrlForTarget(target, {
  HTTPS_PROXY: "http://corp-proxy:8080",
  NO_PROXY: "*.internal",
});
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `HTTP_PROXY` | Proxy for HTTP requests |
| `HTTPS_PROXY` | Proxy for HTTPS requests |
| `ALL_PROXY` | Fallback proxy for any protocol |
| `NO_PROXY` | Hosts to bypass proxying |

Proxy env lookup is case-insensitive. `NO_PROXY` supports:

- `*` to bypass all proxying
- Hostname matching (exact and leading-wildcard, e.g. `*.internal`)
- Port-specific exclusions (`hostname:8080`)

## See Also

- [Browser and Node.js](../browser-usage.md) - Environment detection
- [Utilities](../utilities.md) - Proxy configuration utilities
