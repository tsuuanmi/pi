# Pi Workflow

Pi ships workflow support as the package-shaped first-party `pi:workflows` bundle. It provides the `pi workflow` control plane and four bundled [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/skills/skills.md) for requirements gathering, planning, parallel execution, and goal-tracked execution. The control plane lives under `<workspace>/.pi/state/harness` (override with `PI_HARNESS_STATE_ROOT`) and workflow runtime artifacts persist under the current session root, e.g. `.pi/<session-id>/workflows/<skill>/` and `.pi/<session-id>/state/`.

## Built-in skills

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `deep-interview` | Socratic requirements interview with ambiguity scoring before planning or execution. | Vague, complex, or high-risk requests where assumptions must be exposed before work starts. |
| `ralplan` | Consensus planning that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes. | Turning a spec or task into an explicit, reviewed, approvable plan. |
| `team` | Coordinate parallel implementation workers after an approved plan exists. | When parallel workstreams are useful and execution has been explicitly approved. |
| `ultragoal` | Goal-tracked autonomous execution for an approved, concrete plan. | Implementation after explicit approval, with verification and concise progress tracking. |

Invoke a skill with `/skill:<name>` (e.g. `/skill:ralplan`). See [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/skills/skills.md) for the skill format and installation paths.

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

Workflows dispatch isolated role agents using reusable agent profiles. The bundled `pi:workflows` package provides four default profiles:

| Profile | Role | Default thinking | Default tools |
|---------|------|------------------|---------------|
| `planner` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash` |
| `architect` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash` |
| `critic` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash` |
| `worker` | Execute an assigned task or goal. | `medium` | `read`, `bash`, `write`, `edit` |

All bundled workflow profiles default to `persistent: true` so their session context can be resumed.

### Standard `.agent` / `.agents` resources

Pi also discovers standard agent resources from `.agent` and `.agents` directories:

- Skills: `skills/` under user `~/.agent`, `~/.agents`, and trusted project ancestors.
- Prompts: `prompts/*.md` under user `~/.agent`, `~/.agents`, and trusted project ancestors.
- Context files: `AGENTS.md` and `rules/*.{md,mdc}` under user `~/.agent`, `~/.agents`, and trusted project ancestors.
- System prompts: `SYSTEM.md` and `APPEND_SYSTEM.md` under user `~/.agent`, `~/.agents`, and trusted project ancestors.

Existing Pi `.pi` and package/extension resource semantics remain supported. Project `.agent` / `.agents` resources are trust-gated; user home resources are treated as user scope, not project scope.

### Agent definition files

Profiles are authored as markdown files with YAML frontmatter. Pi discovers markdown profiles from:

1. User: `~/.agent/agents/<name>.md` and `~/.agents/agents/<name>.md`.
2. Package: enabled package `agents/*.md` resources, including the bundled `pi:workflows` profiles.
3. Project (trusted projects only): `.agent/agents/<name>.md` and `.agents/agents/<name>.md` in the current directory or ancestors.

Project ancestor profiles closest to the current directory win over farther ancestors, user profiles, and package profiles. Duplicate losers are reported as diagnostics. The home directory is treated as user scope only, not as a project ancestor.

```markdown
---
name: planner
description: My planner
model: anthropic/claude-sonnet-4-20250514
thinkingLevel: high
tools: read, grep, find, bash
excludeTools: []
persistent: true
---
System prompt body for this profile.
```

Supported fields are `name`, `description`, `model`, `thinkingLevel` (also `thinking-level` or `thinking`), `tools`, `excludeTools`, `systemPrompt`, `appendSystemPrompt`, and `persistent`. `tools` and `excludeTools` may be YAML arrays or comma-separated strings. `persistent` must be a boolean.

Phase 1A recognizes but does not implement some Gajae-style fields. `forkContext`, `bashAllowedPrefixes`, and `spawns` fail closed and skip the profile because their behavior is safety-sensitive. `output`, `autoloadSkills`, `blocking`, and `hide` warn and are ignored.

### Legacy JSON profiles removed

Legacy JSON profile files such as `<agentDir>/agents/<name>.json` and `.pi/agents/<name>.json` are no longer loaded. Use markdown profiles under `.agent/agents` or `.agents/agents` instead.

Per-invocation overrides such as `model`, `thinkingLevel`, `tools`, and `excludeTools` are only accepted on the generic `pi workflow subagents <verb>` control-plane commands. State-guarded role spawns such as `team spawn-task-agent` and `ultragoal spawn-goal-agent` refuse runtime overrides so the harness can enforce the computed next role deterministically.

## Model-visible workflow tools

Workflow-owned model-visible tools are no longer registered. Agents drive workflows through the deterministic `pi workflow` control plane; the harness owns state transitions, artifact gates, receipts, and subagent orchestration. Use `pi workflow subagents <spawn|status|await|steer|pause|resume|cancel>` for generic subagent operations, or the state-guarded `pi workflow team spawn-task-agent` / `pi workflow ultragoal spawn-goal-agent` commands for workflow role spawns.

## Internals (contributors)

A few internals are noted here so contributors can extend the control plane without grepping for seams:

- **Deferred-seam registry** (`harness/runtime/seams.ts`): an explicit, extensible list of designed-not-built harness extensions (`tmux-session-orchestration`, `git-worktree-isolation`, `cross-harness-omx-fallback` [permanently blocked], `remote-transport`, `global-daemon`, `capability-token-auth`). Requesting an unsupported seam fails closed with a self-documenting `seam_unsupported:<name>` token instead of a silent no-op. The registry is wired live into `recoverPrimitive`'s `fallback-harness-exec` branch. Add entries via `DeferredSeamRegistry.register` without changing the orchestrator.
- **`validateReceiptFamilyConsistency`** (`harness/runtime/receipt-rules.ts`): a write-path guard inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target (e.g. a `finalize` receipt that is `accepted` but does not land on `completed`, or a passing `validate` receipt that does not land on `validating`). It throws before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable: blocked variants pass, pre-Phase-3 receipts are grandfathered (write-path only), and future receipt families register rules in `receiptFamilyConsistencyRules` without touching the mutation path.
- **`syncWorkflowHudUi`** (`extensions/workflows.ts`): keeps the interactive HUD in sync after team/ultragoal state mutations made through the `pi workflow` control plane.