---
name: team
description: Coordinate parallel implementation workers after an approved plan exists. Use only when parallel workstreams are useful and execution has been explicitly approved.
argument-hint: "<approved plan or task>"
---

# Team

Team coordinates multiple implementation workstreams. Use it only after the user explicitly approves execution.

## Skill Resources

- Workflow command guide: [references/commands.md](references/commands.md)
- JSON payload schema for `pi workflow team <action>`: [assets/schema.json](assets/schema.json)

Critical: before running any `pi workflow team <action>` command, read [references/commands.md](references/commands.md) for command order and read [assets/schema.json](assets/schema.json) for the exact JSON payload shape. Every action requires `--input` or `--input-file` with the current `sessionId`; do not guess fields. Select the action schema from `x-pi-actions["<action>"]` and construct payloads from that schema.

## Current-Session Command Propagation

- Before constructing any `pi workflow ...` command, obtain the current session id by calling `ctx.sessionManager.getSessionId()`. Use that returned value as `sessionId` in every action payload; never inspect `PI_SESSION_ID`, infer an id from `.pi`, or substitute a placeholder. `--session` applies only to the separate state command.
- Keep all Team state, task records, messages, and gate artifacts under one session id for one logical team run. Do not scatter one run across multiple `.pi/<session-id>` buckets.
- `team_execute` is the only fresh team execution tool. It computes the legal next role and runs that work through the orchestrator.
- `team_resume` is the only recovery tool. It requires an existing non-completed orchestrator checkpoint. There is no direct subagent-spawn execution path.

## Boundaries

- If the request is vague or lacks acceptance criteria, route to `/skill:ralplan` first.
- If a single autonomous worker is enough, prefer `/skill:ultragoal`.
- Do not start implementation until the user has approved execution in the current session or provided a clearly approved plan.
- Keep workers scoped to non-overlapping files or components when possible.

## Workflow

1. Read the approved plan or task.
2. Read active state with `pi workflow state team read`. If no state exists, initialize it with `pi workflow state team write`: `active: true`, `phase: "approved-execution"`, `data.input` set to the plan path or task. For the exact CLI/session/input split, see [State commands](../../state/commands.md).
3. Start or resume runtime coordination with `pi workflow team start --input '{"sessionId":"<current-session>","task":"approved plan..."}' --json`, then use `pi workflow team snapshot --input '{"sessionId":"<current-session>"}' --json` to inspect current state.
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
9. Use `team_execute` for worker, reviewer, and prover role execution; every role runs through the orchestrator.
10. Reviewers must persist `review_report` with `pi workflow team record-review-gate` before task completion.
11. Provers must persist `evidence_matrix` with `pi workflow team record-completion-gate` before `pi workflow team complete`.
12. Merge results carefully, resolve conflicts, and run requested checks.
13. Close the run with `pi workflow team complete --input '{"sessionId":"<current-session>","phase":"complete","summary":"..."}' --json` after integration/verification, then summarize completed work, changed files, verification, and remaining risks.

## Gate

If there is no approved plan or the task is underspecified, stop and ask whether to run `/skill:ralplan` first.
