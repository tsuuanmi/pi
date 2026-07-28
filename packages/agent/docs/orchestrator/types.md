# Orchestrator Types

`src/orchestrator/types.ts` defines scheduling and run-result types used by `Orchestrator` and `runTeam()`.

- `SchedulingStrategy`: `round-robin`, `least-busy`, `dependency-first`, `capability-match`, or `composite`.
- `SchedulingWeights`: composite scheduling weights for capability fit and current load.
- `SchedulerWarning`: warning emitted when no eligible agent satisfies task requirements.
- `OrchestratorConfig`: constructor options for strategy, concurrency, scheduling weights, and warning callbacks.
- `RunTeamOptions`: per-run options, including abort signal and task lifecycle callbacks.
- `RunTeamResult`: success flag, final task snapshots, and concatenated completed-task output.
- `TaskExecutionContext`: task snapshot, assigned agent, team, and completed dependency snapshots.
