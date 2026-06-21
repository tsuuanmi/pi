# Pi Workflow

Pi ships a built-in workflow control plane (`pi workflow`) and four built-in [Skills](skills.md) for requirements gathering, planning, parallel execution, and goal-tracked execution. The control plane lives under `<workspace>/.pi/state/harness` (override with `PI_HARNESS_STATE_ROOT`) and the skills persist state under `.pi/workflows/<skill>/`.

## Built-in skills

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `deep-interview` | Socratic requirements interview with ambiguity scoring before planning or execution. | Vague, complex, or high-risk requests where assumptions must be exposed before work starts. |
| `ralplan` | Consensus planning that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes. | Turning a spec or task into an explicit, reviewed, approvable plan. |
| `team` | Coordinate parallel implementation workers after an approved plan exists. | When parallel workstreams are useful and execution has been explicitly approved. |
| `ultragoal` | Goal-tracked autonomous execution for an approved, concrete plan. | Implementation after explicit approval, with verification and concise progress tracking. |

Invoke a skill with `/skill:<name>` (e.g. `/skill:ralplan`). See [Skills](skills.md) for the skill format and installation paths.

## `pi workflow` control plane

`pi workflow` is the CLI front end for the harness control plane. Every verb accepts `--json` for machine-readable output and `--input '<JSON object>'` for structured arguments.

```text
pi workflow state <skill> read --json
pi workflow start --input '{"workspace":".","sessionId":"optional","detach":true}' --json
pi workflow submit --input '{"sessionId":"h-...","prompt":"work"}' --json
pi workflow observe --input '{"sessionId":"h-..."}' --json
pi workflow classify --input '{"sessionId":"h-..."}' --json
pi workflow recover --input '{"sessionId":"h-..."}' --json
pi workflow validate --input '{"sessionId":"h-...","checks":[{"name":"check","command":"npm run check"}]}' --json
pi workflow finalize --input '{"sessionId":"h-..."}' --json
pi workflow operate --input '{"sessionId":"h-...","goal":"...","maxIterations":10}' --json
pi workflow gc [--prune] [--dry-run] --json
pi workflow events --input '{"sessionId":"h-..."}' --json
pi workflow retire --input '{"sessionId":"h-..."}' --json
```

State root: `PI_HARNESS_STATE_ROOT` or `<workspace>/.pi/state/harness`.

Most verbs route to a live runtime owner when one is running for the session (`start --detach` spawns a detached owner); otherwise they fall back to a primitive (no-owner) path so the CLI can inspect and drive sessions without a running owner.

### `pi workflow gc`

A liveness-only garbage-collection sweep for harness owner sessions.

```bash
pi workflow gc --json             # dry run (default): report only
pi workflow gc --json --prune      # delete confirmed-dead sessions
pi workflow gc --json --dry-run    # explicit dry run
```

Behavior:

- Reaps only confirmed-dead owner sessions: a session is removable iff its lease classifies as `dead` (TTL-irrelevant, liveness-only) **and** a fail-closed pid probe confirms the process is gone (`ESRCH`). Full session-dir removal is performed via `removeSession`.
- Keeps expired-but-alive, `EPERM`, malformed, missing, and no-pid leases. Expired-but-alive is flagged (`expired-alive`) but never removed.
- Dry-run by default. `--prune` performs deletion. `--dry-run` is forced when both are passed.
- The probe is fail-closed: ambiguous/invalid pids fold into an `unknown` outcome that keeps the session.
- Built as an injectable `GcStoreAdapter` seam (`HarnessLeasesGcStoreAdapter`) so future GC stores plug in without changing the orchestrator.

The JSON report shape (committed contract) is:

```jsonc
{
  "dry_run": true,
  "stores": [{ "store": "harness-leases", "roots": ["/path/.pi/state/harness"], "sessions": [] }],
  "counts": { "total": 0, "removable": 0, "kept": 0, "expiredAlive": 0, "errors": 0 },
  "errors": []
}
```

## Reusable agent profiles

Workflows dispatch isolated role agents using reusable agent profiles. Four are built in:

| Profile | Role | Default thinking | Default tools |
|---------|------|------------------|---------------|
| `planner` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash`, `ralplan_write_artifact` |
| `architect` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash`, `ralplan_write_artifact` |
| `critic` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash`, `ralplan_write_artifact` |
| `worker` | Execute an assigned task or goal. | `medium` | `read`, `bash`, `write`, `edit` |

All built-in profiles default to `persistent: true` so their session context can be resumed.

### Overrides

A profile can be overridden with a JSON file in one of these locations (later sources win):

1. Global: `<agentDir>/agents/<name>.json` (e.g. `~/.pi/agent/agents/planner.json`).
2. Project (trusted projects only): `.pi/agents/<name>.json`.

Each JSON file may set any `AgentProfile` field:

```jsonc
{
  "name": "planner",          // defaults to the file basename if omitted
  "description": "My planner", // optional
  "model": "anthropic/claude-sonnet-4-20250514", // provider/model
  "thinkingLevel": "high",     // off | minimal | low | medium | high
  "tools": ["read", "grep", "find", "bash", "ralplan_write_artifact"],
  "excludeTools": [],
  "systemPrompt": "...",        // replaces the profile system prompt
  "appendSystemPrompt": "...",  // appended to the profile/system prompt
  "persistent": true            // false uses an in-memory session
}
```

Per-invocation overrides (e.g. `model`, `thinkingLevel`, `tools`, `excludeTools` on `ralplan_run_agent`, `team_spawn_task_agent`, `ultragoal_spawn_goal_agent`, and the `subagent_*` tools) take precedence over the loaded profile.

## Internals (contributors)

A few internals are noted here so contributors can extend the control plane without grepping for seams:

- **Deferred-seam registry** (`harness-control-plane/seams.ts`): an explicit, extensible list of designed-not-built harness extensions (`tmux-session-orchestration`, `git-worktree-isolation`, `cross-harness-omx-fallback` [permanently blocked], `remote-transport`, `global-daemon`, `capability-token-auth`). Requesting an unsupported seam fails closed with a self-documenting `seam_unsupported:<name>` token instead of a silent no-op. The registry is wired live into `recoverPrimitive`'s `fallback-harness-exec` branch. Add entries via `DeferredSeamRegistry.register` without changing the orchestrator.
- **`validateReceiptFamilyConsistency`** (`harness-control-plane/receipt-consistency.ts`): a write-path guard inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target (e.g. a `finalize` receipt that is `accepted` but does not land on `completed`, or a passing `validate` receipt that does not land on `validating`). It throws before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable: blocked variants pass, pre-Phase-3 receipts are grandfathered (write-path only), and future receipt families register rules in `receiptFamilyConsistencyRules` without touching the mutation path.
- **`syncWorkflowHudUi`** (`extensions/workflows.ts`): keeps the interactive HUD in sync after team/ultragoal state mutations. Team and ultragoal state-mutating tools call it after a write.