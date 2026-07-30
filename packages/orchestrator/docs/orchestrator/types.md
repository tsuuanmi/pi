# Orchestrator Types

`src/types.ts` defines the production orchestration contract used by `Orchestrator`.

| Type | Use |
| --- | --- |
| `TaskRequirements` | Strict hard requirements for task routing |
| `TaskQueueEvent` | Queue lifecycle events for UI, telemetry, and integrations |
| `RunResume` | Checkpoint resume metadata returned with run results |
| `TaskRoutingDecision` | Agent selection diagnostics in traces and receipts |
| `TaskExecutionReceipt` | Stable per-task audit record persisted in checkpoints |
| `OrchestratorCheckpointSnapshot` | Strict versioned checkpoint payload |

- `SchedulingStrategy`: `round-robin`, `least-busy`, `dependency-first`, `capability-match`, or `composite`.
- `SchedulingWeights`: composite scheduling weights for fit and current load.
- `TaskRequirements`: hard agent-selection requirements for capabilities, tools, provider, API, and model.
- `CheckpointFailurePolicy`: checkpoint save policy, either `best-effort` or `strict`.
- `SchedulingWarning`: typed scheduling warning emitted when no agent satisfies a task.
- `OrchestratorEvent`: timestamped progress event for task lifecycle, verification, budget, and error reporting.
- `OrchestratorTraceEvent`: structured telemetry event for planning, consensus, run, task, checkpoint, budget, and verification lifecycle transitions.
- `TaskExecutionMetrics`: per-task timing, attempt, and retry metrics returned with the run result.
- `TaskQueueEvent`: queue lifecycle event emitted for ready, start, complete, fail, skip, block, and all-complete transitions.
- `TaskExecutionReceipt`: stable per-task execution record returned with the run result and persisted in checkpoints. Receipts include rich routing metadata and can include retry classification metadata when a retry classification hook is configured.
- `TaskFailureAction`: failure policy action: `retry`, `fail`, `skip`, or `abort`.
- `TaskFailureContext`: failed-attempt context passed to `onTaskFailure`.
- `onTaskFailure`: policy hook for failed attempts; use this to control retry/fail/skip/abort decisions.
- `PlanOptions`: strict planning options; requires an explicit coordinator agent and supports an optional abort signal and trace hook.
- `PlanResult`: normalized planning result with the original goal, planned tasks, and raw coordinator output.
- `RunBudget`: coarse runtime budget controls for task starts and wall-clock duration; `maxRunMs` aborts in-flight agent calls through the run execution signal.
- `RunResume`: resume metadata returned with each run and persisted in checkpoints.
- `OrchestratorConfig`: constructor options for `schedulingStrategy`, concurrency, scheduling weights, budgets, checkpoint storage, checkpoint failure policy, verification, queue events, scheduling warnings, failure policy, trace hooks, and default progress reporting.
- `RunTeamOptions`: per-run overrides, `abortSignal`, dispatch gate, progress callback, queue event callback, trace hooks, budgets, checkpoint storage, checkpoint failure policy, scheduling warnings, verification, failure policy, and task lifecycle callbacks.
- `RunTeamResult`: lifecycle status, success flag, optional abort reason, run facts, resume metadata, final task snapshots, task metrics, execution receipts, and concatenated completed-task output.
- `TaskExecutionContext`: task snapshot, team, completed dependency snapshots, and attempt number.
- `TaskVerificationContext`: task verification input including agent name, output, structured output, and completed dependencies.
- `ConsensusVerifierOptions`: explicit consensus judge list, approval threshold, abort signal, and trace hook.
- `ConsensusResult`: strict consensus result containing every judge vote, approval count, and rejection count.
- `ConsensusVote`: single judge decision with `approved`, `reason`, and raw output.
- `OrchestratorCheckpointSnapshot`: persisted checkpoint payload containing run facts, resume metadata, queue state, metrics, rich receipts, task-start count, and abort metadata.
- `CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION`: current checkpoint schema version to store with persisted checkpoints.
