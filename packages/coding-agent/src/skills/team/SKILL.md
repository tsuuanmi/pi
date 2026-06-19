---
name: team
description: Coordinate parallel implementation workers after an approved plan exists. Use only when parallel workstreams are useful and execution has been explicitly approved.
argument-hint: "<approved plan or task>"
---

# Team

Team coordinates multiple implementation workstreams. Use it only after the user explicitly approves execution.

## Boundaries

- If the request is vague or lacks acceptance criteria, route to `/ralplan` first.
- If a single autonomous worker is enough, prefer `/ultragoal`.
- Do not start implementation until the user has approved execution in the current session or provided a clearly approved plan.
- Keep workers scoped to non-overlapping files or components when possible.

## Workflow

1. Read the approved plan or task.
2. Start or resume runtime coordination with `team_start`, then use `team_snapshot` or `team_read_compact` to inspect current state.
3. Split work into independent workstreams with clear ownership, files, and verification.
4. For each worker, define:
   - objective
   - allowed files/areas
   - constraints
   - expected output
   - verification commands
5. Persist each workstream with `team_create_task`.
6. Use `team_transition_task` for task starts, blocking, failure, and completion. Completed tasks require completion evidence.
7. Use `team_send_message` to record cross-workstream coordination decisions.
8. Coordinate implementation in the main session unless an installed extension provides real subagent/process orchestration.
9. Merge results carefully, resolve conflicts, and run requested checks.
10. Close the run with `team_complete` after integration/verification, then summarize completed work, changed files, verification, and remaining risks.

## Gate

If there is no approved plan or the task is underspecified, stop and ask whether to run `/ralplan` first.
