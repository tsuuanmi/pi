# Subagent

Orchestrator provides a Pi-hosted `SubagentManager` that wraps the generic `Agent` from `@tsuuanmi/pi-agent` with isolated sessions, persistence, resource loading, native execution, and durable inspection. Extensions install it with `registerSubagentRuntime`; workflow tools resolve it from Pi's generic `ctx.sessionServices`. It is separate from the generic task scheduler, and package extensions own higher-level coordination policy.

The complete subagent boundary lives under `src/subagent/`: `manager.ts` owns the public manager and runtime, `types.ts` owns requests/records/results, `context.ts` and `spec.ts` own tool integration, `progress.ts` and `yield-result.ts` own agent-loop observations, `receipts.ts` owns subagent receipts, `inspection.ts` owns durable inspection, and `lifecycle-tools.ts` owns lifecycle tool registration.

## Records and durability

Each subagent is stored under the owning session's state tree:

```
.pi/<session-id>/state/subagent/
  index.jsonl          # append-only audit log: one line per record write
  <subagent-id>/
    record.json        # full, atomically-written record (temp file + rename)
    artifact.json      # durable terminal output artifact for the subagent
```

`index.jsonl` gets one line per write with `id`, `role`, `status`, `updated_at`, and `session_file`, so the audit trail reconstructs the lifecycle without reading every `record.json`. `record.json` is written atomically (temp file + rename) and remains the lifecycle record, while `artifact.json` stores the terminal result artifact for artifact-first inspection.

A `SubagentRecord` carries: `id`, `role`, `label`, `agent_profile`, `model`, `thinking_level`, `status`, `cwd`, `session_id`, `session_file`, `parent_session_id`, `resumable`, timestamps, `last_prompt_sha256`, `result_text`, `error_text`, and an optional structured `yield_result` (populated when the subagent calls the `yield` tool).

`status` is one of `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.

## Subagent lifecycle tools

All lifecycle tools are registered by `registerSubagentRuntime` and resolve the parent session's orchestrator-owned `SubagentManager` from `ctx.sessionServices`.

### `subagent_spawn`

Spawn an isolated agent session.

```jsonc
{
  "agent": "worker",                 // required: registered agent profile name (.agent/agents, .agents/agents, user agents, or bundled package agents)
  "prompt": "Fix the failing tests",  // required: task prompt
  "model": "anthropic/claude-...",    // optional: provider/model override
  "thinkingLevel": "medium",          // optional: off|minimal|low|medium|high
  "systemPrompt": "...",              // optional: additional system instructions
  "tools": ["read", "bash"],          // optional: allowed tool names
  "excludeTools": ["subagent_spawn"], // optional: tool names to disable
  "persistent": true,                 // optional: defaults to profile or true; false = in-memory session
  "detached": false,                 // optional: return immediately after spawning
  "label": "test-fix"                 // optional: human-readable label
}
```

`detached: true` returns the queued record immediately; collect the result later with `subagent_await`. Non-detached spawns block until the subagent reaches a terminal status.

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

Timeout-aware: if the timeout elapses while the subagent is still running, the result is `{ ok: false, reason: "timeout", timedOut: true }` plus a retained progress snapshot for diagnostics. A timed-out subagent keeps running; await it again or steer/pause/cancel it.

### `subagent_resume`

Resume a saved persistent subagent session with a follow-up message, replaying its saved context.

```jsonc
{
  "id": "subagent-...",        // required
  "message": "Now also add a test", // required: follow-up message
  "agent": "worker",           // optional: override profile
  "model": "...",               // optional: override model
  "thinkingLevel": "high",      // optional: override thinking level
  "tools": [...],               // optional: override allowed tools
  "excludeTools": [...],        // optional: override disabled tools
  "systemPrompt": "..."         // optional: override system prompt
}
```

Returns `{ ok: false, reason: "context_unavailable" | "not_found" | "resume_failed" }` on failure. Resuming requires a persistent record with a saved `session_file`.

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

## Nesting guard

Subagent sessions do **not** receive their own `SubagentManager`. A subagent cannot spawn further subagent runs; orchestration stays in the parent. The `subagent_*` tools are filtered out of a subagent's tool set. Use the parent coordinator to dispatch more workers.

Subagent sessions set `ctx.skipAutomaticContinuation = true` (exposed on `ExtensionContext`) so package extensions do not re-prompt from inside a subagent.

## Lifecycle and orchestration boundary

Orchestrator's `SubagentManagerApi` owns one-subagent lifecycle operations: spawn, await, steer, pause, resume, and cancel. Orchestrator's concrete `SubagentManager` adds durable inspection. `@tsuuanmi/pi-orchestrator` owns task dependencies, agent routing, retries, queues, and collaboration. Higher-level package extensions consume this public orchestrator API.

## Structured receipts and current-session visibility

Subagent tools attach a `details.receipt` (`StructuredReceipt`) to their tool results. The orchestrator-owned inspect control preserves its durable-state result and attaches the generic agent receipt. Package extensions may add domain-specific receipt fields to their own results.

A subagent receipt includes the owning `sessionId`, `subagentId`, role, status, resumability, timing when known, and output/error previews. Persistent subagent conversation logs are written under the same current-session bucket at `.pi/<session-id>/state/subagent/sessions/`, lifecycle records live under `.pi/<session-id>/state/subagent/<subagent-id>/record.json`, and terminal artifacts live under `.pi/<session-id>/state/subagent/<subagent-id>/artifact.json`. `subagent_inspect` returns the record and artifact path directly. Listing subagent records also returns per-record receipts plus an aggregate list receipt. This makes subagent work visible from the parent/current session instead of behaving like black-box detached work.

Before a subagent session starts, orchestrator injects an observability instruction into its system prompt. The guidance includes the parent/current session id when available, subagent id, execution cwd, and a requirement to use Pi-native receipts, status, progress, and durable artifacts. The core in-process agent session is the single execution backend: lifecycle controls operate directly on the live session, while records and artifacts provide durable transparency. Long-running work must remain attributable to the subagent rather than being hidden in detached background processes.