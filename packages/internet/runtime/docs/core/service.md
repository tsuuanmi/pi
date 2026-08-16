# core/service

Mirrors `src/core/service.ts`.

## Role

Installs, starts, stops, restarts, and removes the macOS daemon service and coordinates graceful draining.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `ServiceStatus` | interface — Structural type contract for callers and implementers. | 10 |
| `getServiceStatus` | function — Callable operation exposed to its callers. | 100 |
| `installService` | function — Callable operation exposed to its callers. | 113 |
| `startService` | function — Callable operation exposed to its callers. | 126 |
| `DrainLease` | interface — Structural type contract for callers and implementers. | 135 |
| `requestControl` | function — Callable operation exposed to its callers. | 139 |
| `negotiateDrain` | function — Callable operation exposed to its callers. | 158 |
| `assertServiceIdle` | function — Callable operation exposed to its callers. | 210 |
| `restartService` | function — Callable operation exposed to its callers. | 215 |
| `stopService` | function — Callable operation exposed to its callers. | 229 |
| `uninstallService` | function — Callable operation exposed to its callers. | 243 |

## Behavior and invariants

- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain ChatGPT-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.
- Managed service operations are macOS LaunchAgent operations.
- Stop/restart/uninstall acquire a drain lease and refuse to proceed unless active HTTP and adapter turns are zero.

## Related source modules

- `core/config.ts`
- `core/process.ts`

## Source of truth

The implementation in `src/core/service.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
