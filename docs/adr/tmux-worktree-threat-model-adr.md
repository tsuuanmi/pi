# ADR: Worktree and tmux Threat Model

Status: Accepted
Date: 2026-07-21
Reviewed: 2026-08-04

The system-level requirements are captured in [Pi Workflow Task Lifecycle SRS](../srs/pi-workflow-task-lifecycle-srs.md).

## Context

Pi's agent-management runtime owns a Pi-native tmux worker and bounded live controls for inspectable execution. Git worktrees and tmux sessions can affect a user's checkout, filesystem, terminal processes, and uncommitted work. The tmux backend does not provide worktree isolation; that remains a separate deferred capability.

This ADR defines the minimum safety contract for the implemented tmux path and for any future worktree orchestration. It does not authorize silently adopting existing resources or replacing unavailable tmux execution with a hidden detached process.

## Decision

Worktree orchestration and any new tmux-backed worker behavior must be Pi-native, fail-closed, and receipt-oriented:

- Pi owns only worktrees, branches, metadata, and tmux sessions it creates and records.
- Worktree workers use dedicated checkout paths; the parent checkout is protected by default and is never used as a worker checkout.
- A tmux-backed subagent may run in a caller-provided `cwd`, but that is not worktree isolation and must not be presented as such.
- Dirty parent checkouts block destructive or ambiguous worktree operations unless an explicit user-approved policy allows proceeding.
- Existing paths, existing worktrees, nested repositories, and nested worktrees are detected before creation and treated as collisions unless explicitly adopted by a recorded owner.
- Manual edits inside worker checkouts are preserved until surfaced and resolved by the user or by an explicit merge/apply policy.
- tmux resources are recorded as a pane/session target union and cleaned up only by matching owner metadata.
- Patch application and merges are explicit phases with conflict receipts; conflicts are not auto-resolved silently.
- Cleanup is idempotent and reports permission failures without deleting unowned resources.
- tmux absence or unsupported versions degrade to a blocked/unavailable state, not a hidden detached process.

`cross-harness-omx-fallback` remains permanently blocked. This ADR does not authorize spawning an external harness as a compatibility escape hatch.

## Threats and controls

### Worker owner identity and cleanup authority

Each worker resource must have durable owner metadata including workspace root, parent session/runtime id, worker id, resource kind, exact pane/session target, created path/session name, creation timestamp, and intended cleanup command. Tmux-backed subagents must validate the shared `Subagent Run Identity` schema before cleanup. Cleanup may only remove resources whose metadata matches the active owner scope. If metadata is missing or mismatched, cleanup must refuse or require explicit user confirmation.

### Parent-checkout protection

For worktree orchestration, worker commands must run in dedicated worktree paths, not the parent checkout. The parent checkout may be read for branch/base metadata, but worktree worker implementation must not edit it directly. The current tmux-backed subagent path may use an explicitly supplied `cwd` and does not claim this isolation. Any command that would write to the parent checkout through worktree orchestration is blocked unless the user explicitly requested parent-checkout work outside that path.

### Dirty parent checkout behavior

Before creating workers or applying results, Pi must inspect parent checkout status. Dirty parent state blocks operations that could overwrite, reset, merge into, or confuse uncommitted user work. Safe read-only planning may continue. If future phases offer an override, the receipt must name the dirty files/status and the selected policy.

### Pre-existing path/worktree collisions

Worktree paths and branch names must be deterministic enough to inspect but unique enough to avoid collisions. If the path, branch, git worktree entry, or tmux session already exists, Pi must verify owner metadata before reusing it. Unowned collisions block with remediation instructions.

### Nested repositories and worktrees

Pi must detect nested `.git` directories, gitfiles, submodules, and existing worktree roots in both parent and proposed worker paths. Nested repositories are not deleted by cleanup. Applying worker output across repository boundaries is blocked unless a future ADR explicitly defines multi-repository semantics.

### Manual edits in worker checkouts

User or tool edits in a worker checkout are treated as user data. Cleanup must not remove dirty worker checkouts silently. Merge/apply phases must report dirty files and either include them in the explicit patch plan or block for user direction.

### Worker crash and orphaned tmux sessions

Workers may crash or leave tmux panes or sessions alive. Pi must support inspection and recovery receipts that include the exact pane/session target, cwd, attach/list/inspect commands, and cleanup command. Orphan detection may mark resources stale, but stale does not mean safe to delete without owner match and dirty-state checks.

### Patch application and merge conflict rules

Worker results must be applied through explicit patch, cherry-pick, merge, or file-copy phases with a receipt. Conflicts block and surface affected files. Pi must not auto-resolve conflicts, discard hunks, run `git reset --hard`, or clean untracked files as part of normal worker result application.

### Cleanup idempotency and permission failures

Cleanup commands must be safe to retry. Missing already-cleaned resources count as successful no-ops when owner metadata proves prior ownership. Permission failures are reported with exact resource paths/session names and leave metadata for later retry.

### tmux absence or version mismatch

If tmux is missing, unavailable, or below the feature level needed by the requested live controls, Pi blocks tmux-backed orchestration with a clear receipt. It may continue native non-live planning or short-lived subagent execution where that path already exists, but it must not replace tmux with a hidden detached background process.

## Implementation gates

This ADR is accepted. Pi now owns and tests the tmux worker and live-control implementation described here; worktree isolation remains a separate deferred capability.

`git-worktree-isolation` remains a deferred seam that fails closed when requested. Tmux session orchestration is implemented only by Pi and fails closed when ownership metadata or the required tmux command is unavailable.

## Consequences

- Future implementation must add durable owner metadata before cleanup automation.
- User-visible receipts are required for create, inspect/recover, apply/merge, and cleanup phases.
- Destructive git cleanup commands are out of policy for normal worker orchestration.
- Live controls must prefer explicit tmux pane/session resources over invisible detached processes.
