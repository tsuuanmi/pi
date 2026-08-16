# core/event-queue

Mirrors `src/core/event-queue.ts`.

## Role

Provides bounded asynchronous event delivery for runtime producers and consumers.

## Public surface

| Export | Kind | Source line |
| --- | --- | ---: |
| `AsyncEventQueue` | class — Stateful component with lifecycle or coordination methods. | 1 |

## Behavior and invariants

- These provider-neutral primitives are used by the runtime entrypoint and adapter host; they do not contain ChatGPT-specific protocol logic.
- Failures are explicit and synchronous/asynchronous according to the underlying operation, so callers can surface them at the CLI or HTTP boundary.
- Paths, process commands, and service state are treated as security-sensitive inputs and are validated before they are persisted or launched.
- `push` resolves a waiting consumer immediately; otherwise it buffers until the consumer resumes.
- The default backlog is 10,000 items and overflow throws instead of dropping adapter events.

## Source of truth

The implementation in `src/core/event-queue.ts` is authoritative. Update this page when its exported API, data flow, or safety behavior changes.
