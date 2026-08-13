# Subagent

Orchestrator provides a Pi-hosted `SubagentManager` that wraps the generic `Agent` from `@tsuuanmi/pi-agent` with isolated sessions, persistence, resource loading, native execution, and durable inspection. Extensions install it with `registerSubagentRuntime`; workflow tools resolve it from Pi's generic `ctx.sessionServices`. It is separate from the generic task scheduler, and package extensions own higher-level coordination policy.

The complete subagent boundary lives under `src/subagent/`: `manager.ts` owns the public manager and runtime, `types.ts` owns requests/records/results, `context.ts` and `spec.ts` own tool integration, `progress.ts` and `yield-result.ts` own agent-loop observations, `receipts.ts` owns subagent receipts, `inspection.ts` owns durable inspection, and `lifecycle-tools.ts` owns lifecycle tool registration.

## Records and durability

Each subagent is stored under the owning session's state tree (the canonical layout is owned by `@tsuuanmi/pi`; see [Canonical `.pi` Session Layout](../../../pi/docs/session/layout.md)):

```
.pi/<session-id>/state/subagent/
  index.jsonl          # append-only audit log: one line per record write
  <subagent-id>/
    record.json        # full, atomically-written record (temp file + rename)
    artifact.json      # durable terminal output artifact for the subagent
```

`index.jsonl` gets one line per write with `id`, `role`, `status`, `updated_at`, and `session_file`, so the audit trail reconstructs the lifecycle without reading every `record.json`. `record.json` is written atomically (temp file + rename) and remains the lifecycle record, while `artifact.json` stores the terminal result artifact for artifact-first inspection.

A `SubagentRecord` carries generic lifecycle fields plus optional opaque `execution_metadata` and `output_artifact` metadata. The manager persists caller metadata but never interprets workflow names, stages, roles, goals, or artifact formats. An intentionally in-memory run (`persistent: false`, `resumable: false`) has no durable `session_file`; status and receipts identify that state explicitly.

`status` is one of `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`. A model response stopped by its output-length limit is recorded as `failed`, with any earlier text retained as partial `result_text`, rather than as an empty successful result.

## Subagent lifecycle tools

All lifecycle tools are registered by `registerSubagentRuntime` and resolve the parent session's orchestrator-owned `SubagentManager` from `ctx.sessionServices`.

### `subagent_spawn`

Execute a caller-configured subagent in an isolated session.

```jsonc
{
  "agent": "worker",
  "role": "implementation-worker",
  "task": { "promptFile": ".pi/tasks/G001.md" },
  "systemPrompt": "Execute only the assigned goal and report evidence.",
  "persistent": true,
  "detached": false,
  "maxDurationMs": 120000,
  "label": "goal-G001",
  "metadata": { "workflow": "ultragoal", "taskId": "G001" },
  "outputArtifact": {
    "path": ".pi/reports/G001.md",
    "mode": "create",
    "mediaType": "text/markdown"
  }
}
```

`task` contains exactly one of `prompt` or `promptFile`; file paths stay inside the workspace and cannot traverse symbolic links. `outputArtifact` is optional and separate from the runtime `artifact.json`. Create mode refuses an existing destination. Replace mode requires `expectedSha256` and fails if the current file changed. The resulting absolute path, SHA-256 digest, media type, and mode are recorded in `SubagentRecord.output_artifact`.

`detached: true` returns the queued record immediately. The parent should continue useful work, poll with `subagent_status` or bounded `subagent_await` calls (`timeoutMs`), and collect the terminal result before integrating it. Non-detached spawns block until the subagent reaches a terminal status.

`maxDurationMs` sets a hard wall-clock run-time budget. If the subagent has not reached a terminal status when the budget expires, the manager aborts the run and records it as `failed` (see [Max run-time rule](#max-run-time-rule)).

### `subagent_status`

Read one subagent record or list recent records.

```jsonc
{
  "id": "subagent-...",   // optional: omit to list recent records
  "limit": 10,            // optional: max records when listing (default 10)
  "verbosity": "receipt"  // optional: receipt (default) | preview | full
}
```

`verbosity` controls output truncation:

- `receipt` (default): truncated summary.
- `preview`: up to 2000 chars of `result_text`/`error_text`.
- `full`: full output. Requires an explicit `id`.

### `subagent_await`

Await a live subagent or read its terminal result.

```jsonc
{
  "id": "subagent-...",       // required
  "timeoutMs": 30000,         // optional: await timeout in ms; returns reason=timeout when exceeded
  "verbosity": "receipt"      // optional: receipt (default) | preview | full
}
```

Timeout-aware: if the timeout elapses while the subagent is still running, the result is `{ ok: false, reason: "timeout", timedOut: true }` plus a retained progress snapshot for diagnostics. A timed-out subagent keeps running; the parent can continue other work and make another bounded await/status call later, or steer/pause/cancel it.

### `subagent_resume`

Resume a saved persistent subagent session with a follow-up message, replaying its saved context.

```jsonc
{
  "id": "subagent-...",        // required
  "message": "Now also add a test", // required: follow-up message
  "maxDurationMs": 120000      // optional: hard wall-clock run-time budget in ms; re-armed for this resume
}
```

Returns `{ ok: false, reason: "context_unavailable" | "not_found" | "resume_failed" }` on failure. Resuming requires a persistent record with a saved `session_file`.

`maxDurationMs` re-arms the run-time watchdog for this resume. If omitted, the budget from the original spawn is reused when available.

### `subagent_steer`

Inject a steering message into a live subagent, or resume it from saved context if it is not live.

```jsonc
{
  "id": "subagent-...",            // required
  "message": "Switch to approach B", // required
  "delivery": "steer"             // optional: steer (default) | followUp
}
```

`steer` injects the message as a steering turn; `followUp` queues it as a follow-up. For a non-live subagent, `subagent_steer` falls back to `resume`.

### `subagent_pause`

Pause a running subagent at a safe boundary. Its saved context remains resumable.

```jsonc
{ "id": "subagent-..." }
```

This is a cooperative pause (see below). Returns `{ ok: false, reason: "not_running" | "already_paused" }` if the subagent is not live or already paused.

### `subagent_cancel`

Cancel a live or durable subagent record.

```jsonc
{ "id": "subagent-..." }
```

Cancels a live subagent by aborting its controller and waiting for execution to settle; the manager writes a `cancelled` terminal record if the current status is not already terminal.

### `subagent_inspect`

Inspect a subagent's durable state and artifact location.

```jsonc
{ "id": "subagent-..." }
```

Returns the durable `SubagentRecord` and terminal artifact path. Inspection works for running and terminal native subagents and does not require a separate worker process or terminal backend.

## Cooperative pause at turn boundaries

`pause()` does not abort the subagent mid-prompt. The agent loop reads `AgentOptions.shouldPause` at turn boundaries; when `pauseRequested` is set, the loop exits gracefully after the current turn and the subagent lands in `paused` with its saved context intact. `subagent_resume` continues from that context.

## Max run-time rule

A subagent can be given a hard wall-clock run-time budget via `maxDurationMs` on `subagent_spawn` (and re-armed on `subagent_resume`). This is a **run-side deadline**: the subagent is not allowed to run forever, independent of how long the caller waits.

- The manager arms a watchdog when the run starts. If the run has not reached a terminal status when the budget expires, the watchdog aborts the run and records it as `failed` with an error text such as `subagent exceeded max run time (maxDurationMs ms)`.
- The retained progress snapshot (turns, current tool, recent output) is preserved on the timeout path so the parent can diagnose where the subagent was stuck.
- The status enum is unchanged (`failed`); the timeout is distinguishable by the error text.
- On `subagent_resume`, the watchdog is re-armed for the resume's `maxDurationMs`; if omitted, the original spawn budget is reused when available.

This is distinct from `subagent_await`'s `timeoutMs`, which only stops the caller from waiting while the subagent keeps running. `maxDurationMs` stops the managed run and releases it from the live registry. It must be a positive safe integer. Because execution is in-process, synchronous JavaScript that blocks the Node event loop cannot be interrupted by a timer; model requests and supported tools are expected to honor abort.

## Nesting guard

Subagent sessions do **not** receive their own `SubagentManager`. A subagent cannot spawn further subagent runs; orchestration stays in the parent. The generic execution/lifecycle tools, including `subagent_spawn` and `subagent_*`, are filtered out of a subagent's tool set. Use the parent coordinator to dispatch more workers.

Subagent sessions set `ctx.skipAutomaticContinuation = true` (exposed on `ExtensionContext`) so package extensions do not re-prompt from inside a subagent.

## Lifecycle and orchestration boundary

Orchestrator's `SubagentManagerApi` owns one-subagent lifecycle operations: spawn, await, steer, pause, resume, and cancel. Orchestrator's concrete `SubagentManager` adds durable inspection. `@tsuuanmi/pi-orchestrator` owns task dependencies, agent routing, retries, queues, and collaboration. Higher-level package extensions consume this public orchestrator API.

## Structured receipts and current-session visibility

Subagent tools attach a `details.receipt` (`StructuredReceipt`) to their tool results. The orchestrator-owned inspect control preserves its durable-state result and attaches the generic agent receipt. Package extensions may add domain-specific receipt fields to their own results.

A subagent receipt includes the owning `sessionId`, `subagentId`, role, status, resumability, timing when known, and output/error previews. Persistent subagent conversation logs are written under the same current-session bucket at `.pi/<session-id>/state/subagent/sessions/`, lifecycle records live under `.pi/<session-id>/state/subagent/<subagent-id>/record.json`, and terminal artifacts live under `.pi/<session-id>/state/subagent/<subagent-id>/artifact.json`. `subagent_inspect` returns the record and artifact path directly. Listing subagent records also returns per-record receipts plus an aggregate list receipt. This makes subagent work visible from the parent/current session instead of behaving like black-box detached work.

Before a subagent session starts, orchestrator injects an observability instruction into its system prompt. The guidance includes the parent/current session id when available, subagent id, execution cwd, and a requirement to use Pi-native receipts, status, progress, and durable artifacts. The core in-process agent session is the single execution backend: lifecycle controls operate directly on the live session, while records and artifacts provide durable transparency. Long-running work must remain attributable to the subagent rather than being hidden in detached background processes.