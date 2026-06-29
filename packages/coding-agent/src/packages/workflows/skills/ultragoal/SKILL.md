---
name: ultragoal
description: Goal-tracked autonomous execution for an approved, concrete plan. Use for implementation after explicit approval, with verification and concise progress tracking.
argument-hint: "<approved plan or concrete task>"
---

# Ultragoal

Ultragoal executes an approved concrete goal end-to-end with verification.

## Boundaries

- If the request is vague, run `/skill:deep-interview` or `/skill:ralplan` first.
- If no execution approval exists, stop and ask for approval.
- Do not widen scope beyond the approved goal.
- Follow project instructions for checks. In this repo, run `npm run check` after code changes unless the user says otherwise.

## Workflow

1. Restate the approved goal and acceptance criteria.
2. Read active state with `pi_workflow_state` for `skill: "ultragoal"`. If no state exists and you have an approved plan, initialize it with `pi_workflow_state` `action: write`: `active: true`, `phase: "approved-execution"`, `data.input` set to the plan path or task.
3. Create or resume runtime goal state with `ultragoal_status`, `ultragoal_read_compact`, and `ultragoal_create_plan` when no plan exists.
4. Start the next runnable goal with `ultragoal_start_next` before implementation.
5. Inspect relevant files before editing.
6. Make the smallest complete set of changes.
7. Keep a running checklist internally:
   - implementation
   - tests/docs as needed
   - verification
   - cleanup
8. Run required checks and fix failures.
9. Checkpoint each goal with `ultragoal_checkpoint`. Complete checkpoints require substantive evidence and the full quality gate: `architectReview`, `executorQa`, and `iteration`. Old `executorQa + contractCoverage` top-level gates and free-form `{status}` gates are rejected.
10. Use `ultragoal_record_review_blockers` when review/verification finds blockers that must become durable follow-up work, and `ultragoal_classify_blocker` only when a `failed`/`blocked` checkpoint is truly human-blocked.
11. Report:
   - changed files
   - verification results
   - any unresolved risks or follow-ups

## Review blockers and blocked checkpoints

- `ultragoal_record_review_blockers` marks the current goal `review_blocked`, appends a pending blocker-resolution goal, and records the blocker in the ledger.
- Completing that blocker-resolution goal supersedes the original `review_blocked` goal when verification passes.
- `ultragoal_checkpoint --status failed|blocked` is fail-closed unless the immediate latest ledger event is `blocker_classified` with `classification: "human_blocked"` for the same/current active goal. `resolvable` never authorizes giving up.
- Rejected complete/failed/blocked checkpoints must not mutate goals, ledger, receipts, HUD, or workflow state.

## Complete checkpoint quality gate

Complete checkpoints hard-break to the full gate shape:

```json
{
  "architectReview": {
    "architectureStatus": "CLEAR",
    "productStatus": "CLEAR",
    "codeStatus": "CLEAR",
    "recommendation": "APPROVE",
    "commands": ["architect review evidence"],
    "evidence": "architecture/product/code review summary",
    "blockers": []
  },
  "executorQa": {
    "status": "passed",
    "e2eStatus": "passed",
    "redTeamStatus": "passed",
    "evidence": "executor QA and red-team evidence",
    "e2eCommands": ["focused e2e command"],
    "redTeamCommands": ["focused red-team command"],
    "artifactRefs": [],
    "surfaceEvidence": [],
    "adversarialCases": [],
    "contractCoverage": [],
    "blockers": []
  },
  "iteration": {
    "status": "passed",
    "fullRerun": true,
    "rerunCommands": ["final rerun command"],
    "evidence": "full verification reran cleanly",
    "blockers": []
  }
}
```

Top-level `contractCoverage`, legacy `codeReview`, old receipts, and unsupported keys fail closed. GJC-only goal/session/CLI mechanics are not part of Pi Ultragoal.

## Quality Bar

- Prefer simple, maintainable changes.
- Do not remove intentional behavior without asking.
- Preserve user-approved constraints.
- If the plan proves wrong, stop and ask or route back to `/skill:ralplan` rather than improvising a larger scope.
