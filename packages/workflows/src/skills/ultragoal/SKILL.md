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
2. Read active state with `pi workflow state ultragoal read`. If no state exists and you have an approved plan, initialize it with `pi workflow state ultragoal write`: `active: true`, `phase: "approved-execution"`, `data.input` set to the plan path or task.
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

Complete checkpoints hard-break to the full gate shape. Do not guess the nested schema: include every field below. The runtime reports missing nested fields together, but a valid complete checkpoint must be self-contained and replayable enough for review.

Minimal valid template:

```json
{
  "architectReview": {
    "architectureStatus": "CLEAR",
    "productStatus": "CLEAR",
    "codeStatus": "CLEAR",
    "recommendation": "APPROVE",
    "commands": ["reviewed final diff and verification"],
    "evidence": "architecture/product/code review summary",
    "blockers": []
  },
  "executorQa": {
    "status": "passed",
    "e2eStatus": "passed",
    "redTeamStatus": "passed",
    "evidence": "executor QA and red-team evidence summary",
    "e2eCommands": ["npm run build && npx vitest --run"],
    "redTeamCommands": ["rg ... || true"],
    "artifactRefs": [
      {
        "id": "verification-report",
        "kind": "verification-report",
        "description": "Build/test/grep verification report",
        "verifiedReceipt": {
          "verifiedAt": "2026-07-17T00:00:00.000Z",
          "summary": "build, tests, typecheck, red-team grep gates passed"
        }
      }
    ],
    "surfaceEvidence": [
      {
        "id": "surface-public-api",
        "surface": "public package exports and command surface",
        "contractRef": "contract#single-workflow-surface",
        "invocation": "rg public tool/export/command patterns",
        "result": "passed",
        "artifactRefs": ["verification-report"]
      }
    ],
    "adversarialCases": [
      {
        "id": "case-missing-artifact",
        "contractRef": "contract#fail-closed",
        "scenario": "missing required artifact or gate",
        "expectedBehavior": "checkpoint/transition is rejected fail-closed",
        "result": "passed",
        "artifactRefs": ["verification-report"]
      }
    ],
    "contractCoverage": [
      {
        "id": "coverage-single-surface",
        "contractRef": "contract#single-workflow-surface",
        "obligation": "only the approved workflow surface is exposed",
        "status": "passed",
        "surfaceEvidenceRefs": ["surface-public-api"],
        "adversarialCaseRefs": ["case-missing-artifact"]
      }
    ],
    "blockers": []
  },
  "iteration": {
    "status": "passed",
    "fullRerun": true,
    "rerunCommands": ["npm run build && npx vitest --run"],
    "evidence": "full verification reran cleanly after final edits",
    "blockers": []
  }
}
```

Required nested fields that agents commonly miss:

- `executorQa.artifactRefs[]`: `id`, `kind`, `description`, plus a live proof such as `verifiedReceipt`, `receipt`, `inlineEvidence`, `path`, or a supported replay/exemption object.
- `executorQa.surfaceEvidence[]`: `id`, `surface`, `contractRef`, `invocation`, `result` (or `verdict`), and `artifactRefs` pointing at `artifactRefs[].id`.
- `executorQa.adversarialCases[]`: `id`, `contractRef`, `scenario`, `expectedBehavior`, `result` (or `verdict`), and `artifactRefs`.
- `executorQa.contractCoverage[]`: `id`, `contractRef`, `obligation`, `status`, plus `surfaceEvidenceRefs`, `adversarialCaseRefs`, or `artifactRefs`.
- Every `blockers` array must be present and empty for completion.

Top-level `contractCoverage`, legacy `codeReview`, old receipts, and unsupported keys fail closed. GJC-only goal/session/CLI mechanics are not part of Pi Ultragoal.

## Quality Bar

- Prefer simple, maintainable changes.
- Do not remove intentional behavior without asking.
- Preserve user-approved constraints.
- If the plan proves wrong, stop and ask or route back to `/skill:ralplan` rather than improvising a larger scope.
