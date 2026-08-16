# providers/chatgpt-web/lifecycle/setup

Mirrors `src/providers/chatgpt-web/lifecycle/setup.ts`.

## Role

Performs first-time runtime setup, connector configuration, and persisted setup state.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `SetupOptions` | interface — Structural type contract for callers and implementers. | 30 |
| `SetupResult` | interface — Structural type contract for callers and implementers. | 45 |
| `ExistingFullSetupCredentials` | interface — Structural type contract for callers and implementers. | 54 |
| `existingFullSetupCredentials` | function — Callable operation exposed to its callers. | 59 |
| `tunnelWorkerRuntimeChanged` | function — Callable operation exposed to its callers. | 110 |
| `setupProxyIsReady` | function — Callable operation exposed to its callers. | 126 |
| `setup` | function — Callable operation exposed to its callers. | 235 |

## Behavior and invariants

- Lifecycle modules are used by setup/doctor/CLI commands and by the daemon control path, not by provider content conversion.
- Configuration and administrative requests are validated at the boundary and protected by the local runtime control token.
- Setup and diagnostics preserve actionable distinctions between required runtime failures and optional account capabilities.
- Creates or updates `AppConfig` while preserving existing connector choices unless explicitly replaced.
- Records the runtime/config digest used to authorize durable continuation.

## Related source modules

- `providers/chatgpt-web/lifecycle/config.ts`
- `providers/chatgpt-web/browser/login.ts`
- `core/service.ts`
- `providers/chatgpt-web/transport/tunnel.ts`
- `providers/chatgpt-web/transport/tunnel-service.ts`
- `core/config.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/lifecycle/setup.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
