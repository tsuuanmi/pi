# Subagents

Pi ships a Pi-native `SubagentManager` that runs isolated agent sessions as subagents of the current session. It is exposed to extensions as `ctx.subagents` and to the agent through seven `subagent_*` tools. Subagents are the execution primitive used by the [team](../../../../workflows/docs/workflow.md) and [ultragoal](../../../../workflows/docs/workflow.md) skills to spawn parallel workers.

## Records and durability

Each subagent is stored under the owning session's state tree:

```
.pi/<session-id>/state/subagents/
  index.jsonl          # append-only audit log: one line per record write
  <subagent-id>/
    record.json        # full, atomically-written record (temp file + rename)
    artifact.json      # durable terminal output artifact for the subagent
```

`index.jsonl` gets one line per write with `id`, `role`, `status`, `updated_at`, and `session_file`, so the audit trail reconstructs the lifecycle without reading every `record.json`. `record.json` is written atomically (temp file + rename) and remains the lifecycle record, while `artifact.json` stores the terminal result artifact for artifact-first inspection.

A `SubagentRecord` carries: `id`, `role`, `label`, `agent_profile`, `model`, `thinking_level`, `status`, `cwd`, `session_id`, `session_file`, `parent_session_id`, `resumable`, timestamps, `last_prompt_sha256`, `result_text`, `error_text`, and an optional structured `yield_result` (populated when the subagent calls the `yield` tool).

`status` is one of `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.

## The seven subagent tools

All seven tools are registered by the built-in workflows extension and operate on the parent session's `SubagentManager` via `ctx.subagents`.

### `subagent_spawn`

Spawn an isolated agent session.

```jsonc
{
  "agent": "worker",                 // optional: markdown agent profile name from .agent/agents, .agents/agents, or built-ins
  "role": "implementer",             // optional: role label; defaults to profile name or "subagent"
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

Cancels a live subagent by aborting its controller; writes a `cancelled` terminal record if the current status is not already terminal.

## Cooperative pause at turn boundaries

`pause()` does not abort the subagent mid-prompt. The agent loop reads `AgentOptions.shouldPause` at turn boundaries; when `pauseRequested` is set, the loop exits gracefully after the current turn and the subagent lands in `paused` with its saved context intact. `subagent_resume` continues from that context.

## Nesting guard

Subagent sessions do **not** receive their own `SubagentManager`. A subagent cannot spawn further subagents; orchestration stays in the parent. The `subagent_*` tools are filtered out of a subagent's tool set. Use the parent manager (or `team_spawn_task_agent` / `ultragoal_spawn_goal_agent`) to dispatch more workers.

Subagent sessions also set `ctx.skipWorkflowContinuation = true` (exposed on `ExtensionContext`), which prevents workflow continuation prompts from leaking into the subagent. Extensions that drive workflows should honor this flag so they do not re-prompt from inside a subagent.

## Team and ultragoal spawn linking

The team and ultragoal skills spawn subagent workers through dedicated tools rather than calling `subagent_spawn` directly:

- **`team_spawn_task_agent`** - spawn a subagent to execute a team task. Parameters: `teamId`, `taskId`, `agent` (defaults to `worker`), plus `model`/`thinkingLevel`/`tools`/`excludeTools` overrides.
- **`ultragoal_spawn_goal_agent`** - spawn a subagent to execute an ultragoal goal. Parameters: `goalId`, `agent` (defaults to `worker`), plus the same overrides.

Both reuse the parent session's `SubagentManager`, so spawned workers appear in that session's `state/subagents/index.jsonl` and can be inspected with `subagent_status`/`subagent_await` like any other subagent. After a mutation, team and ultragoal state-mutating tools call `syncWorkflowHudUi` to keep the interactive HUD in sync.

## Structured receipts and current-session visibility

Subagent tools attach a `details.receipt` (`StructuredReceipt`) to their tool results. The receipt is additive: existing `record`, `records`, `output`, and workflow receipt fields remain intact, while the shared receipt gives renderers and extensions a consistent summary of the current-session subagent activity.

A subagent receipt includes the owning `sessionId`, `subagentId`, role, status, cwd, resumability, timing when known, output/error previews, and inspect pointers such as the saved session file and artifact path. Persistent subagent conversation logs are written under the same current-session bucket at `.pi/<session-id>/state/subagents/sessions/`, while lifecycle records live under `.pi/<session-id>/state/subagents/<subagent-id>/record.json` and terminal artifacts live under `.pi/<session-id>/state/subagents/<subagent-id>/artifact.json`. Listing subagents also returns per-record receipts plus an aggregate list receipt. This makes subagents visible from the parent/current session instead of behaving like black-box detached work.

Before a subagent session starts, Pi injects an observability instruction into that subagent's system prompt. The injected guidance includes the parent/current session id when available, the subagent id, the cwd, and the requested visibility mode (`native`, `tmux`, or `auto`). Long-running work should prefer explicit tmux sessions over hidden detached background processes. When tmux-backed work is used, the durable record carries the shared `Subagent Run Identity` schema (`@tsuuanmi/pi-agent`) with the storage root, execution cwd, owner scope, paths, and a pane/session tmux target union so the parent session can render an inspectable receipt.

`subagent_spawn` defaults to `visibility: "native"`: use Pi-native receipts, status, await, pause, resume, and session-local logs. `visibility: "tmux"` requests an explicit tmux-visible panel for live terminal work, but it is not forced for every subagent because headless mode, CI, short-lived tasks, and non-terminal environments still need native execution. `visibility: "auto"` currently resolves to the native backend until a later tmux policy gate changes that behavior.

Tmux-backed subagents expose bounded live controls through `subagent_inspect`, `subagent_attach`, and `subagent_kill`. Inspect returns durable record/artifact/worker paths plus tmux metadata. Attach returns the exact target-specific command: pane-backed workers use a recorded pane id and `select-pane`, while session-backed workers use the recorded session target and `attach-session`. Kill validates the shared `Subagent Run Identity` schema metadata in the record and worker metadata before cleanup, then uses `kill-pane` for pane targets or `kill-session` for session targets. Legacy or mismatched identity metadata fails closed. Pause, resume, and heartbeat controls remain deferred.