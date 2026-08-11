# Tasks

Task responsibilities are separated by module:

| Module | Responsibility |
| --- | --- |
| `src/task/types.ts` | Task inputs, snapshots, statuses, requirements, verification, and queue event contracts |
| `src/task/task.ts` | Task state and valid lifecycle transitions |
| `src/task/dependencies.ts` | Dependency validation, readiness, and deterministic ordering |
| `src/task/prompt.ts` | Execution prompt formatting and bounded dependency payloads |
| `src/task/queue.ts` | Task collection, queue events, and snapshot partitions |

Task snapshots preserve UUID-backed IDs, dependency IDs, requirements, routing hints, retry settings, opaque verification payloads, result text, structured output, error state, attempt counts, and timestamps. Task metadata is validated, bounded, and redacted before storage or prompt formatting. Queue snapshots include pending, in-progress, completed, failed, blocked, and skipped partitions for deterministic restore/resume flows.

Dependency graph operations are public Orchestrator primitives. Workflow packages may use them to validate durable task graphs, but workflow-specific admission and historical state remain owned by the workflow adapter.
