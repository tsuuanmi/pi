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
9. Checkpoint each goal with `ultragoal_checkpoint`. Complete checkpoints require substantive evidence and a passed/verified quality gate.
10. Report:
   - changed files
   - verification results
   - any unresolved risks or follow-ups

## Quality Bar

- Prefer simple, maintainable changes.
- Do not remove intentional behavior without asking.
- Preserve user-approved constraints.
- If the plan proves wrong, stop and ask or route back to `/skill:ralplan` rather than improvising a larger scope.
