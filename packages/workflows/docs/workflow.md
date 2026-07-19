# Pi Workflow

Pi ships workflow support as the package-shaped first-party `pi:workflows` bundle. It provides the `pi workflow` control plane and four bundled [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/skills/skills.md) for requirements gathering, planning, parallel execution, and goal-tracked execution. The control plane lives under `<workspace>/.pi/state/harness` (override with `PI_HARNESS_STATE_ROOT`) and workflow runtime artifacts persist under the current session root, e.g. `.pi/<session-id>/workflows/<skill>/` and `.pi/<session-id>/state/`.

## Built-in skills

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `deep-interview` | Socratic requirements interview with ambiguity scoring before planning or execution. | Vague, complex, or high-risk requests where assumptions must be exposed before work starts. |
| `ralplan` | Consensus planning that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes. | Turning a spec or task into an explicit, reviewed, approvable plan. |
| `team` | Coordinate parallel implementation workers after an approved plan exists. | When parallel workstreams are useful and execution has been explicitly approved. |
| `ultragoal` | Goal-tracked autonomous execution for an approved, concrete plan. | Implementation after explicit approval, with verification and concise progress tracking. |

Invoke a skill with `/skill:<name>` (e.g. `/skill:ralplan`). See [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/skills/skills.md) for the skill format and installation paths.

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

Workflows dispatch isolated role agents using reusable agent profiles. The bundled `pi:workflows` package provides default profiles under `src/agents/`:

| Profile | Role | Default thinking | Default tools |
|---------|------|------------------|---------------|
| `planner` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash` |
| `architect` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash` |
| `critic` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash` |
| `worker` | Execute an assigned task or goal. | `medium` | `read`, `bash`, `write`, `edit` |
| `explorer` | Read-only ralplan context mapping before planning. | `low` | `read`, `bash` |
| `expert` | Ralplan escalation after iterate-cap or explorer-gate human blocker. | package default | package/default tools |
| `prover` | Verify team completion evidence and produce `evidence_matrix`. | `low` | `read`, `bash` |
| `reviewer` | Review team task completion and produce `review_report`. | `medium` | `read`, `bash` |

Bundled profiles set `persistent: true` in frontmatter when they need resumable context; profiles without that field use the agent-layer default.

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

Per-invocation overrides such as `model`, `thinkingLevel`, `tools`, and `excludeTools` are accepted by the model-visible spawn tools when their schemas expose them. State-guarded team and ultragoal spawns refuse runtime overrides so the harness can enforce the computed next role deterministically.

## Model-visible workflow tools

Spawn verbs are model-visible tools; non-spawn verbs are `pi workflow` commands. Workflow-owned spawn tools (`subagent_spawn` / `subagent_status` / `subagent_await` / `subagent_steer` / `subagent_pause` / `subagent_resume` / `subagent_cancel`, `ralplan_run_agent`, `team_spawn_task_agent`, `team_spawn_review_agent`, `team_spawn_prover_agent`, `ultragoal_spawn_goal_agent`) are registered by the workflow extension and call the main session's `SubagentManager` directly in-process — the only place a subagent can be spawned and run to completion. The role agents are ordinary subagents; the workflow's special part is the turn order, the guarded role check, and the result→artifact handoff. Non-spawn workflow ops (state, artifacts, gates, status, approve-plan, etc.) remain `pi workflow ...` commands.

## Current-session command propagation

A `sessionId` is required on every `pi workflow ...` skill verb (deep-interview, ralplan, team, ultragoal) and on `pi workflow start`; no verb mints a session id, and all fail closed with `sessionId is required` when it is missing. When a skill runs inside an interactive Pi session, pass the current session id into every command input as `sessionId` using `ctx.sessionManager.getSessionId()` (or the equivalent session source); do not rely on `PI_SESSION_ID`/`--session` fallback during skill execution. One logical workflow (one interview, one plan, one team run, one goal run) must keep all state, active-state, specs, plans, and handoff artifacts under one session id. Do not scatter one logical workflow across multiple `.pi/<session-id>` buckets. Missing current-session propagation is release-blocking: commands that fall back to a different session id will write state the interactive HUD cannot see.

Spawn tools read the session id from `ctx.sessionManager.getSessionId()`, so they always co-locate under the current session — there is no propagation risk for spawns. Read-only and recovery verbs (`state`, `events`, `gc`, `retire`, `status`, `read-compact`, `doctor`, `recover`) still work without a live owner so a dead owner never locks users out of inspecting or recovering state. The detached `RuntimeOwner` is lifecycle-only and does not host spawns.

## HUD visibility for command-created sessions

The interactive status line reads session-scoped workflow active state (`.pi/<session-id>/workflows/active-state.json`) on a 1s refresh and renders the HUD for the current interactive session only. Workflow HUD synchronization is registered by the extension through `@tsuuanmi/pi-tui`; the status line is the single source of truth.

Behavior:
- Only the active/attached interactive session shows its own workflow in the HUD.
- A `pi workflow ...` command run from a shell with a different session id updates that command's session state, not the visible interactive HUD.
- Command-created sessions become visible in the HUD only after attaching/switching to that session in an interactive Pi runtime.
- This session-scoped behavior is intentional: it prevents one session's workflow state from unexpectedly changing another session's HUD.

## Internals (contributors)

### Ralplan deterministic completion boundary

Ralplan role completion is accepted through a local deterministic harness slice. `buildRalplanOrchestrationSnapshot` reads the workflow state, ralplan index, explorer gate, artifact hashes, completion provenance sidecars, transaction journals, approval state, and obstacle ledger without repairing them, then emits a versioned fingerprint over canonically ordered data. `selectExpectedRalplanAction` is pure over that snapshot and returns one next spawn/closed/blocked/no-action result.

`writeRalplanArtifact` now writes completion-visible artifacts through a journaled transaction: intent journal, stage artifact, index row, optional `pending-approval.md`, obstacle ledger update for blocking verdicts, workflow state receipt, completion provenance sidecar (`<artifact>.completion.json`), active HUD, and committed journal marker. Rejected or stale attempts fail before product-visible writes where possible; failed post-validation attempts leave rollback evidence in the journal, and cleanup is limited to paths that can be removed without making an already-visible index row point at a missing artifact. Duplicate writes are successful only for the same run/stage/stageN/role/path/hash identity; mismatched hashes or invalid index lines fail closed.

The v1 repair allowlist is intentionally narrow: same-hash duplicate handling and missing completion-provenance sidecar backfill. Artifact markdown, verdicts, stage/run/phase/approval/gate semantics, mismatched hashes, influential invalid JSONL, ambiguous gates, closed state, and mixed repairable/non-repairable issues are not repaired by this slice. Full replay tooling and shared orchestration engines for team, ultragoal, and deep-interview are deferred.

A few internals are noted here so contributors can extend the control plane without grepping for seams:

- **Deferred-seam registry** (`runtime/seams.ts`): an explicit, extensible list of designed-not-built harness extensions (`tmux-session-orchestration`, `git-worktree-isolation`, `cross-harness-omx-fallback` [permanently blocked], `remote-transport`, `global-daemon`, `capability-token-auth`). Requesting an unsupported seam fails closed with a self-documenting `seam_unsupported:<name>` token instead of a silent no-op. The registry is wired live into `recoverPrimitive`'s `fallback-harness-exec` branch. Add entries via `DeferredSeamRegistry.register` without changing the orchestrator.
- **`validateReceiptFamilyConsistency`** (`runtime/receipt-rules.ts`): a write-path guard inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target (e.g. a `finalize` receipt that is `accepted` but does not land on `completed`, or a passing `validate` receipt that does not land on `validating`). It throws before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable: blocked variants pass, pre-Phase-3 receipts are grandfathered (write-path only), and future receipt families register rules in `receiptFamilyConsistencyRules` without touching the mutation path.
- **Workflow HUD builders**: per-skill HUD modules (`deep-interview-hud.ts`, `ralplan-hud.ts`, `team-hud.ts`, `ultragoal-hud.ts`) build active-state summaries in the owning harness folder. Extension-side HUD refresh is provided through `@tsuuanmi/pi-tui`.