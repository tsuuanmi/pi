# ADR: Worktree and tmux Threat Model

Status: Accepted
Date: 2026-07-21

## Context

Pi's agent-management migration can use git worktrees and tmux sessions for inspectable worker implementation and live controls, but these primitives can affect a user's checkout, filesystem, terminal processes, and uncommitted work. Worktree and tmux orchestration must therefore be threat-modeled before Gate 4 worker implementation or Gate 5 live controls begin.

This ADR accepts the minimum safety contract for future implementation. It does not implement worktree or tmux orchestration by itself.

## Decision

Future worktree/tmux orchestration must be Pi-native, fail-closed, and receipt-oriented:

- Pi owns only worktrees, branches, metadata, and tmux sessions it creates and records.
- The parent checkout is protected by default and is never used as a worker checkout.
- Dirty parent checkouts block destructive or ambiguous operations unless an explicit user-approved policy allows proceeding.
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

Worker commands must run in dedicated worktree paths, not the parent checkout. The parent checkout may be read for branch/base metadata, but worker implementation must not edit it directly. Any command that would write to the parent checkout is blocked unless the user explicitly requested parent-checkout work outside the worker orchestration path.

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

This ADR is accepted and satisfies the precondition for beginning subsequent Gate 4 worker implementation and Gate 5 live controls design. Those gates must still implement and test the controls above before enabling live worktree/tmux behavior.

Until an implementation lands, `git-worktree-isolation` and `tmux-session-orchestration` remain deferred seams that fail closed when requested.

## Consequences

- Future implementation must add durable owner metadata before cleanup automation.
- User-visible receipts are required for create, inspect/recover, apply/merge, and cleanup phases.
- Destructive git cleanup commands are out of policy for normal worker orchestration.
- Live controls must prefer explicit tmux pane/session resources over invisible detached processes.
