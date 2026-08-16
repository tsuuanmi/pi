# adapters/chatgpt-web/lifecycle/doctor

Mirrors `src/adapters/chatgpt-web/lifecycle/doctor.ts`.

## Role

Runs ChatGPT Web runtime diagnostics and reports actionable configuration/browser failures.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CheckStatus` | type — Union or alias used to constrain protocol data. | 9 |
| `DoctorCheck` | interface — Structural type contract for callers and implementers. | 11 |
| `DoctorReport` | interface — Structural type contract for callers and implementers. | 18 |
| `runDoctor` | function — Callable operation exposed to its callers. | 61 |
| `formatDoctorReport` | function — Callable operation exposed to its callers. | 136 |

## Behavior and invariants

- Lifecycle modules are used by setup/doctor/CLI commands and by the daemon control path, not by provider content conversion.
- Configuration and administrative requests are validated at the boundary and protected by the local runtime control token.
- Setup and diagnostics preserve actionable distinctions between required runtime failures and optional account capabilities.
- Checks configuration, browser/executable availability, login state, service/tunnel state, and connector prerequisites.
- Reports required failures separately from optional account capabilities.

## Related source modules

- `adapters/chatgpt-web/lifecycle/config.ts`
- `adapters/chatgpt-web/browser/login.ts`
- `core/service.ts`
- `adapters/chatgpt-web/transport/tunnel.ts`
- `adapters/chatgpt-web/transport/tunnel-service.ts`

## Source of truth

The implementation in `src/adapters/chatgpt-web/lifecycle/doctor.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
