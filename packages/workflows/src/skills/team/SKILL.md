---
name: team
description: Coordinate parallel implementation workers after an approved plan exists. Use only when parallel workstreams are useful and execution has been explicitly approved.
argument-hint: "<approved plan or task>"
---

# Team

Team coordinates multiple implementation workstreams. Use it only after the user explicitly approves execution.

## Current-Session Command Propagation

- When running inside an interactive Pi session, pass the current session id into every `pi workflow ...` command input as `sessionId`. Use `ctx.sessionManager.getSessionId()` (or the equivalent session source) — do not rely on `PI_SESSION_ID`/`--session` fallback during skill execution.
- Keep all Team state, task records, messages, and gate artifacts under one session id for one logical team run. Do not scatter one run across multiple `.pi/<session-id>` buckets.
- `team_spawn_task_agent`, `team_spawn_review_agent`, and `team_spawn_prover_agent` are guarded spawn tools that spawn team workers, reviewers, and provers as ordinary subagents of the main session. The workflow computes the legal next team role and refuses off-script task ids or runtime model/tool overrides. The spawn happens in-process in the main session; there is no `pi workflow` command for it.

## Boundaries

- If the request is vague or lacks acceptance criteria, route to `/skill:ralplan` first.
- If a single autonomous worker is enough, prefer `/skill:ultragoal`.
- Do not start implementation until the user has approved execution in the current session or provided a clearly approved plan.
- Keep workers scoped to non-overlapping files or components when possible.

## Workflow

1. Read the approved plan or task.
2. Read active state with `pi workflow state team read`. If no state exists, initialize it with `pi workflow state team write`: `active: true`, `phase: "approved-execution"`, `data.input` set to the plan path or task.
3. Start or resume runtime coordination with `pi workflow team start`, then use `pi workflow team snapshot` or `pi workflow team read-compact` to inspect current state.
4. Split work into independent workstreams with clear ownership, files, and verification.
5. For each worker, define:
   - objective
   - allowed files/areas
   - constraints
   - expected output
   - verification commands
6. Persist each workstream with `pi workflow team create-task`.
7. Use `pi workflow team transition-task` for task starts, blocking, failure, and completion. Completed tasks require completion evidence.
8. Use `pi workflow team send-message` to record cross-workstream coordination decisions.
9. Spawn workers only through the guarded `team_spawn_task_agent` route when subagents are needed; otherwise coordinate implementation in the main session.
10. After a task is in progress, spawn the reviewer through `team_spawn_review_agent`; the reviewer must persist `review_report` with `pi workflow team record-review-gate` before task completion.
11. After all tasks are completed, spawn the prover through `team_spawn_prover_agent`; the prover must persist `evidence_matrix` with `pi workflow team record-completion-gate` before `pi workflow team complete`.
12. Merge results carefully, resolve conflicts, and run requested checks.
13. Close the run with `pi workflow team complete` after integration/verification, then summarize completed work, changed files, verification, and remaining risks.

## Gate

If there is no approved plan or the task is underspecified, stop and ask whether to run `/skill:ralplan` first.
