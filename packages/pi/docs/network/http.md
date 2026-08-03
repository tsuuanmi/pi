# HTTP Networking

Pi configures global `fetch` through an undici dispatcher with idle-timeout and proxy support.

## Dispatcher

```typescript
function configureHttpDispatcher(timeoutMs?: number): void;
```

The default idle timeout is 300,000ms (5 minutes). It can be configured with the `httpIdleTimeoutMs` setting.

## Idle Timeout Choices

| Label | Timeout |
|-------|---------|
| 30 sec | 30,000 |
| 1 min | 60,000 |
| 2 min | 120,000 |
| 5 min | 300,000 (default) |
| disabled | 0 |

## Proxy

```typescript
function applyHttpProxySettings(httpProxy?: string): void;
```

When configured, this sets `HTTP_PROXY` and `HTTPS_PROXY` without overwriting existing environment variables.

## Source Boundary

The implementation lives in `packages/pi/src/network/http-dispatcher.ts`. It is separate from command and shell execution.

## See Also

- [Settings](../settings/settings.md) - HTTP proxy and idle timeout configuration
- [Security](../security.md) - Trust boundaries and sandboxing
