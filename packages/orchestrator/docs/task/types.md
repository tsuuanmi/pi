# Task Types

`src/task/types.ts` defines task input, snapshot, dependency payload, priority, memory-scope, status, and verification types used by `Task`, `TaskQueue`, and `Orchestrator`.

Task snapshots preserve UUID-backed IDs, dependency IDs, requirements, routing hints, retry settings, opaque verification payloads, result text, structured output, error state, attempt counts, and timestamps. Task metadata is validated, bounded, and redacted before storage or prompt formatting. Queue snapshots include pending, in-progress, completed, failed, blocked, and skipped partitions for deterministic restore/resume flows.
