# Orchestrator

The `Orchestrator` runs explicit task DAGs with dependency-aware scheduling, agent assignment, retries, abort handling, trace hooks, and production progress events.

## Planning model

Use `orchestrator.plan(team, goal, { coordinator })` to create a strict task plan. Planning is separate from execution.

- A coordinator agent must be supplied explicitly.
- Planner output must be a JSON array of task objects.
- Every planned task must include explicit `id`, `title`, and `description` fields.
- `dependsOn` must reference planned task IDs, not task titles.
- Declared dependencies are preserved exactly; the planner does not widen, drop, or infer dependency edges.
- Unknown assignees, unknown dependencies, duplicate IDs, dependency cycles, malformed JSON, empty plans, and abort signals fail fast.
- `plan()` returns tasks only; call `run()` explicitly to execute them.

## Execution model

- Task graphs are validated before execution.
- Teams must contain at least one agent.
- Explicit task assignees must match a team agent name; invalid assignees fail before any task starts.
- Ready tasks launch as soon as their dependencies complete.
- Newly unblocked tasks do not wait for unrelated long-running work to finish.
- Failed, skipped, or impossible dependency chains are marked non-success deterministically.
- `RunTeamResult.status` is `completed` unless the run is aborted by `abortSignal` or a dispatch gate.
- `RunTeamResult.metrics` records per-task start/end time, duration, attempts, and retries.

## Scheduling strategies

Configure the default strategy with `schedulingStrategy` on `new Orchestrator()` or override it per run.

- `dependency-first`: prioritize tasks that unblock the most downstream work.
- `composite`: rank by dependency criticality, capability fit, role hints, and current load.
- `capability-match`: prefer agents whose capabilities satisfy task requirements.
- `least-busy`: prefer the agent with the fewest active tasks.
- `round-robin`: distribute work evenly across the roster.

Composite scheduling uses weighted scoring:

- `fit`: capability match score
- `load`: current agent load

When no agent satisfies task requirements, scheduling fails fast and the run does not start that task.

## Retry and abort behavior

Use `onTaskFailure` for failure decisions. It is the policy hook that decides whether a failed attempt should `retry`, `fail`, `skip`, or `abort`.

- `maxRetries`, `retryDelayMs`, and `retryBackoff` are the default retry policy when `onTaskFailure` is not supplied.
- `onTaskFailure` overrides that default policy for each failed attempt.
- `onTaskStart` fires on every attempt.
- `onTaskComplete` fires only on the final successful outcome.
- `abortSignal` is passed into `agent.run()` and abortable retry delays.
- `runBudget.maxRunMs` creates an orchestrator-owned abort signal for in-flight agent calls.
- Aborted pending tasks are marked `skipped`, and the result status is `aborted`.

## Run budgets

The orchestrator can enforce coarse runtime budgets with `runBudget`.

- `maxTaskStarts`: stop dispatch once the configured number of task starts is reached.
- `maxRunMs`: abort the run once the wall-clock budget is exceeded, including in-flight agent calls.

Budget exhaustion emits a `budget_exceeded` progress event, aborts active agent calls through the execution signal, and skips remaining pending work deterministically.

## Run identity

Each run has a `RunIdentity` with a non-empty `runId` and optional metadata. Pass `runIdentity` on `Orchestrator` or per `run()` when callers need deterministic correlation; otherwise the orchestrator creates one for the run. Execution progress events, trace events, checkpoints, receipts, and `RunTeamResult` all carry the same identity. Checkpoint resume rejects a caller-supplied identity that does not exactly match the checkpoint identity. Resume also validates run facts: team name, agent roster order, and task ids must match the checkpoint.

## Execution receipts

`RunTeamResult.receipts` exposes stable per-task `TaskExecutionReceipt` records keyed by task id. Receipts include run id, task identity, status, attempts, timing, retry count, optional routing decision, optional verification result, optional consequential approval result, and task error text. Checkpoints persist the same receipt map so resumed runs keep prior task receipts.

## Checkpoints

Provide a `checkpointStore` to persist and resume orchestrator runs.

- The store receives a versioned checkpoint with `CURRENT_ORCHESTRATOR_CHECKPOINT_VERSION`.
- Version 4 checkpoints include `runIdentity`, run facts, a `TaskQueueSnapshot`, per-task metrics, execution receipts, and the current task-start count.
- Checkpoint loads are validated before execution; unsupported versions and malformed payloads fail fast.
- Only `running` checkpoints are resumable; completed or aborted checkpoints are terminal.
- A resumed run restores the task queue from the checkpoint snapshot and continues from the remaining work.
- Interrupted `in_progress` checkpoint tasks are reset before retrying.
- Checkpoints are written at run start, on task transitions, and on run completion or abort.

## Governance hooks

Use `onTaskDispatch` to approve or reject task launch after scheduling but before execution. Returning `false` rejects the task, aborts further dispatch, skips pending tasks, and returns an aborted result.

Use `onTaskVerify` to reject completed task output before it is finalized. Verification runs only for tasks that set `verify`.

Use `onTaskConsequential` to approve or reject tasks that explicitly set `consequential: true`. Consequential tasks are blocked before execution when approval is missing or denied.

Use `createConsensusVerifier({ judges, minApprovals })` when verification should require explicit judge agreement. Judges must be supplied explicitly, `minApprovals` must be set explicitly, and every judge must return strict JSON with exactly `approved` and `reason` fields. Malformed judge output fails verification.

Use `onTaskFailure` to classify failed attempts as `retry`, `fail`, `skip`, or `abort`. This is the only hook that controls failure policy.

Use `onTrace` for structured planning/execution telemetry and `onProgress` for user-facing production observability. Task routing is exposed through the `routeReadyTasks` boundary and the exported `Scheduler` / `AgentSelector` routing primitives, then emitted as `routing_decision` trace events with a `TaskRoutingDecision` payload. Trace events include:

- `plan_start`
- `plan_complete`
- `plan_abort`
- `plan_error`
- `consensus_start`
- `consensus_vote`
- `consensus_complete`
- `consensus_error`
- `run_start`
- `run_complete`
- `run_abort`
- `routing_decision`
- `task_dispatch`
- `task_start`
- `task_complete`
- `task_retry`
- `task_skipped`
- `task_verify`
- `task_consequential`
- `task_short_circuit`
- `checkpoint_save`
- `checkpoint_save_error`
- `budget_exceeded`
- `error`

`task_retry` includes a structured `retryDecision` payload with the exponential delay, jitter, and final wait duration. When `onTaskRetryClassify` is provided, `task_retry` also includes a stable retry classification.
`task_consequential` includes an `approved` flag for explicit high-impact task approval.

Progress events include:

- `task_start`
- `task_complete`
- `task_retry`
- `task_skipped`
- `task_verify`
- `task_consequential`
- `error`

## Structured handoffs

Tasks may request dependency payload behavior with `dependencyPayload`:

- `output`: pass only the dependency output text
- `structured`: pass only structured output
- `both`: pass text and structured output

`role`, `priority`, `memoryScope`, and `verify` are included in the task prompt context. Agents can return `structured` output alongside text through `AgentRunResult` extraction. Dependent tasks receive that payload in their prompt context.

The orchestrator formats each task as a normal Agent prompt and calls `agent.run()`. Task execution is isolated from persistent Agent history and serialized per Agent instance.

## Example

```typescript
import { Agent, Orchestrator, Team } from "@tsuuanmi/pi-agent";

const orchestrator = new Orchestrator({
  schedulingStrategy: "composite",
  onProgress: (event) => console.log(event.type, event.taskId),
});

const team = new Team({
  name: "builders",
  agents: [
    new Agent({ name: "writer", capabilities: ["write"], initialState: { model, systemPrompt, tools }, streamFn }),
    new Agent({ name: "reviewer", capabilities: ["review"], initialState: { model, systemPrompt, tools }, streamFn }),
  ],
});

const result = await orchestrator.run(
  team,
  [
    { id: "draft", title: "Draft", description: "Write the draft", dependencyPayload: "structured" },
    { id: "review", title: "Review", description: "Review the draft", dependsOn: ["draft"], requires: ["review"] },
  ],
  { abortSignal },
);
```
