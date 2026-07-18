---
name: team
description: Coordinate parallel implementation workers after an approved plan exists. Use only when parallel workstreams are useful and execution has been explicitly approved.
argument-hint: "<approved plan or task>"
---

# Team

Team coordinates multiple implementation workstreams. Use it only after the user explicitly approves execution.

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
9. Spawn workers only through the guarded `pi workflow team spawn-task-agent` route when subagents are needed; otherwise coordinate implementation in the main session.
10. Merge results carefully, resolve conflicts, and run requested checks.
11. Close the run with `pi workflow team complete` after integration/verification, then summarize completed work, changed files, verification, and remaining risks.

## Gate

If there is no approved plan or the task is underspecified, stop and ask whether to run `/skill:ralplan` first.
