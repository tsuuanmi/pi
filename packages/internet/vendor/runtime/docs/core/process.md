# core/process

Mirrors `src/core/process.ts`.

## Role

Provides process probing, checked command execution, and detached process spawning.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `CommandResult` | interface — Structural type contract for callers and implementers. | 3 |
| `processRunning` | function — Callable operation exposed to its callers. | 9 |
| `runCommand` | function — Callable operation exposed to its callers. | 24 |
| `runChecked` | function — Callable operation exposed to its callers. | 38 |
| `spawnDetached` | function — Callable operation exposed to its callers. | 47 |

## Behavior and invariants

- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain ChatGPT-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.

## Source of truth

The implementation in `src/core/process.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
