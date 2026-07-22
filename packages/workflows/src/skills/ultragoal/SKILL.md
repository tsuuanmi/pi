---
name: ultragoal
description: Goal-tracked autonomous execution for an approved, concrete plan. Use for implementation after explicit approval, with verification and concise progress tracking.
argument-hint: "<approved plan or concrete task>"
---

# Ultragoal

Ultragoal executes an approved concrete goal end-to-end with verification.

## Skill Resources

- Workflow command guide: [references/commands.md](references/commands.md)
- JSON payload schema for `pi workflow ultragoal <action>`: [assets/schema.json](assets/schema.json)

Critical: before running any `pi workflow ultragoal <action>` command, read [references/commands.md](references/commands.md) for command order and read [assets/schema.json](assets/schema.json) for the exact JSON payload shape. Do not guess `--input` or `--input-file` fields; select the action schema from `x-pi-actions["<action>"]` and construct payloads from that schema.

## Current-Session Command Propagation

- When running inside an interactive Pi session, pass the current session id into every `pi workflow ...` command input as `sessionId`. Use `ctx.sessionManager.getSessionId()` (or the equivalent session source) — do not rely on `PI_SESSION_ID`/`--session` fallback during skill execution.
- Keep all Ultragoal state, goal ledger, checkpoint receipts, and blocker records under one session id for one logical goal run. Do not scatter one run across multiple `.pi/<session-id>` buckets.
- `ultragoal_spawn_goal_agent` is a guarded spawn tool that spawns an ultragoal worker as an ordinary subagent of the main session. The workflow computes the legal next goal and refuses off-script goal ids or runtime model/tool overrides. The spawn happens in-process in the main session; there is no `pi workflow` command for it.

## Boundaries

- If the request is vague, run `/skill:deep-interview` or `/skill:ralplan` first.
- If no execution approval exists, stop and ask for approval.
- Do not widen scope beyond the approved goal.
- Follow project instructions for checks. In this repo, run `npm run check` after code changes unless the user says otherwise.

## Workflow

1. Restate the approved goal and acceptance criteria.
2. Read active state with `pi workflow state ultragoal read`. If no state exists and you have an approved plan, initialize it with `pi workflow state ultragoal write`: `active: true`, `phase: "approved-execution"`, `data.input` set to the plan path or task. For the exact CLI/session/input split, see [State commands](../../state/commands.md).
3. Create or resume runtime goal state with `pi workflow ultragoal status`, `pi workflow ultragoal read-compact`, and `pi workflow ultragoal create-plan` when no plan exists.
4. Start the next runnable goal with `pi workflow ultragoal start-next` before implementation.
5. Inspect relevant files before editing.
6. Make the smallest complete set of changes.
7. Keep a running checklist internally:
   - implementation
   - tests/docs as needed
   - verification
   - cleanup
8. Run required checks and fix failures.
9. Checkpoint each goal with `pi workflow ultragoal checkpoint`. Complete checkpoints require substantive evidence and the full quality gate: `architectReview`, `executorQa`, and `iteration`. Old `executorQa + contractCoverage` top-level gates and free-form `{status}` gates are rejected.
10. Use `pi workflow ultragoal record-review-blockers` when review/verification finds blockers that must become durable follow-up work, and `pi workflow ultragoal classify-blocker` only when a `failed`/`blocked` checkpoint is truly human-blocked.
11. Report:
   - changed files
   - verification results
   - any unresolved risks or follow-ups

## Review blockers and blocked checkpoints

- `pi workflow ultragoal record-review-blockers` marks the current goal `review_blocked`, appends a pending blocker-resolution goal, and records the blocker in the ledger.
- Completing that blocker-resolution goal supersedes the original `review_blocked` goal when verification passes.
- `pi workflow ultragoal checkpoint` with `status: "failed"` or `status: "blocked"` is fail-closed unless the immediate latest ledger event is `blocker_classified` with `classification: "human_blocked"` for the same/current active goal. `resolvable` never authorizes giving up.
- Rejected complete/failed/blocked checkpoints must not mutate goals, ledger, receipts, HUD, or workflow state.

## Complete checkpoint quality gate

Complete checkpoints hard-break to the full `qualityGate` shape defined in [assets/schema.json](assets/schema.json). Do not keep or recreate inline legacy schemas in this file. Before a complete checkpoint, read the `checkpoint` action schema from `x-pi-actions["checkpoint"]` and the nested `qualityGate` definition from `$defs.qualityGate`.

Important constraints still apply: top-level `contractCoverage`, legacy `codeReview`, old receipts, and unsupported keys fail closed. GJC-only goal/session/CLI mechanics are not part of Pi Ultragoal.

## Quality Bar

- Prefer simple, maintainable changes.
- Do not remove intentional behavior without asking.
- Preserve user-approved constraints.
- If the plan proves wrong, stop and ask or route back to `/skill:ralplan` rather than improvising a larger scope.
