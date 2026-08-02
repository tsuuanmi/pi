# Team Skill

Coordinate parallel implementation workers after an approved plan exists.

**Source:** `src/skills/team/`

## Usage

```bash
/skill:team <approved plan or task>
```

## Overview

Team manages the coordination board under `.pi/<session-id>/team/<team-id>/`. It tracks tasks, worker messages, review gates, completion evidence, and guarded worker/reviewer/prover execution.

## Module Structure

| Module | Description |
|--------|-------------|
| `team-compact.ts` | Prompt-efficient compact state projection. |
| `team-hud.ts` | HUD chip rendering for team status. |
| `team-runtime.ts` | State I/O, task transitions, messages, gates, completion, and snapshot/read-compact operations. |
| `team-tools.ts` | Registers `team_execute` and `team_resume`. |
| `team-coordinator.ts` | Selects the legal role and submits its batch to Orchestrator. |
| `role-contract.ts` | Validates required reviewer/prover workflow evidence. |
| `role-run-store.ts` | Persists failures for synthetic and concrete role runs. |
| `role-tasks.ts` | Builds worker, reviewer, and prover task batches. |
| `role-transitions.ts` | Applies workflow-owned transitions after successful role execution. |
| `receipt-store.ts` | Persists role receipts with idempotent keys. |
| `execution-failure.ts` | Builds durable failed execution state. |
| `team-transitions.ts` | Skill transition table, expected-next worker selection, fail-closed gate validators. |

## Runtime Route

- Read/write envelope state through `pi workflow state team ...` with the current `sessionId`.
- Manage the team board through `pi workflow team <start|snapshot|read-compact|create-task|transition-task|send-message|record-review-gate|record-completion-gate|complete>`.
- Execute workers through the model-visible `team_execute` tool.
- Execute task reviewers through `team_execute`; reviewers persist `review_report` with `pi workflow team record-review-gate`.
- Execute completion provers through `team_execute`; provers persist `evidence_matrix` with `pi workflow team record-completion-gate`.

Use `team_execute` for worker, reviewer, and prover execution, and `team_resume` only for checkpoint recovery. Worker and reviewer runs require a running team; the legal prover run is allowed during `awaiting_integration`. A reviewer or prover result succeeds only when its gate status is `passed` and its structured verdict validates and passes. The coordinator computes the legal next team role and refuses off-sequence execution or implicit checkpoint reuse.

## Workflow

1. Confirm execution is explicitly approved.
2. Start or resume a team run.
3. Split the approved plan into independent, non-overlapping tasks.
4. Persist tasks with objectives, constraints, ownership, expected output, and verification.
5. Execute the selected role through `team_execute` or recover it with `team_resume`.
6. Record progress, messages, review gates, and completion evidence.
7. Integrate results and close only after required gates pass.

## Task States

| State | Description |
|-------|-------------|
| `pending` | Task created, not started. |
| `in_progress` | Worker is running. |
| `blocked` | Waiting on dependency or human decision. |
| `completed` | Task finished and passed required gates. |
| `failed` | Task failed. |

## State Files

| File | Description |
|------|-------------|
| `.pi/<session-id>/team/<teamId>/config.json` | Team coordination state. |
| `.pi/<session-id>/team/<teamId>/tasks/` | Task definitions and evidence. |
| `.pi/<session-id>/team/<teamId>/events.jsonl` | Event log. |
| `.pi/<session-id>/team/<teamId>/mailbox/<recipient>.jsonl` | Per-recipient messages. |

## Gates

- Completed tasks must have a passing review gate.
- Completed teams must have a passing completion evidence gate.
- Transition validators fail closed when required state, session, or gate evidence is missing.

## See Also

- [Workflow control plane](../../workflow.md)
- [Subagents and workflow tools](../../subagents/subagents.md)
