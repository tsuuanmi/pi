# providers/chatgpt-web/lifecycle/control

Mirrors `src/providers/chatgpt-web/lifecycle/control.ts`.

## Role

Implements authenticated control requests for the running ChatGPT Web runtime.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `cancelBrowserTurns` | function — Callable operation exposed to its callers. | 4 |

## Behavior and invariants

- Lifecycle modules are used by setup/doctor/CLI commands and by the daemon control path, not by provider content conversion.
- Configuration and administrative requests are validated at the boundary and protected by the local runtime control token.
- Setup and diagnostics preserve actionable distinctions between required runtime failures and optional account capabilities.
- Provides authenticated drain, resume, cancellation, and inspection operations for the daemon.
- The control surface is separate from provider Responses routes and requires the runtime control token.

## Related source modules

- `core/config.ts`
- `core/service.ts`

## Source of truth

The implementation in `src/providers/chatgpt-web/lifecycle/control.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
