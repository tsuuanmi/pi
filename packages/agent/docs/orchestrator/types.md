# Orchestrator Types

`src/orchestrator/types.ts` defines the production orchestration contract used by `Orchestrator`.

- `SchedulingStrategy`: `round-robin`, `least-busy`, `dependency-first`, `capability-match`, or `composite`.
- `SchedulingWeights`: composite scheduling weights for capability fit and current load.
- `OrchestratorEvent`: timestamped progress event for task lifecycle, verification, budget, and error reporting.
- `OrchestratorTraceEvent`: structured telemetry event for planning, consensus, run, task, checkpoint, budget, and verification lifecycle transitions.
- `TaskExecutionMetrics`: per-task timing, attempt, and retry metrics returned with the run result.
- `TaskExecutionReceipt`: stable per-task execution record returned with the run result and persisted in checkpoints. Receipts can include retry classification metadata when a retry classification hook is configured.
- `TaskFailureAction`: failure policy action: `retry`, `fail`, `skip`, or `abort`.
- `TaskFailureContext`: failed-attempt context passed to `onTaskFailure`.
- `onTaskFailure`: policy hook for failed attempts; use this to control retry/fail/skip/abort decisions.
- `PlanOptions`: strict planning options; requires an explicit coordinator agent and supports an optional abort signal and trace hook.
- `PlanResult`: normalized planning result with the original goal, planned tasks, and raw coordinator output.
- `RunBudget`: coarse runtime budget controls for task starts and wall-clock duration; `maxRunMs` aborts in-flight agent calls through the run execution signal.
- `OrchestratorConfig`: constructor options for `schedulingStrategy`, concurrency, scheduling weights, budgets, checkpoint storage, verification, failure policy, trace hooks, and default progress reporting.
- `RunTeamOptions`: per-run overrides, `abortSignal`, dispatch gate, progress callback, trace hooks, budgets, checkpoint storage, verification, failure policy, and task lifecycle callbacks.
- `RunTeamResult`: lifecycle status, success flag, optional abort reason, run facts, final task snapshots, task metrics, execution receipts, and concatenated completed-task output.
- `TaskExecutionContext`: task snapshot, team, completed dependency snapshots, and attempt number.
- `TaskVerificationContext`: task verification input including agent name, output, structured output, and completed dependencies.
- `ConsensusVerifierOptions`: explicit consensus judge list, approval threshold, abort signal, and trace hook.
- `ConsensusResult`: strict consensus result containing every judge vote, approval count, and rejection count.
- `ConsensusVote`: single judge decision with `approved`, `reason`, and raw output.
- `OrchestratorCheckpointSnapshot`: persisted checkpoint payload containing run facts, queue state, metrics, receipts, task-start count, and abort metadata.
- `CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION`: current checkpoint schema version to store with persisted checkpoints.
