# Task Types

`src/task/types.ts` defines task input, snapshot, dependency payload, priority, memory-scope, status, and verification types used by `Task`, `TaskQueue`, and `Orchestrator`.

Task snapshots preserve dependency IDs, requirements, routing hints, retry settings, opaque verification payloads, result text, structured output, error state, attempt counts, and timestamps.
