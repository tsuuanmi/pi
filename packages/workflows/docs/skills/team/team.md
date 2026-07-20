# Team Skill

Coordinate parallel implementation workers after an approved plan exists.

**Source:** `src/skills/team/`

## Usage

```bash
/skill:team <approved plan or task>
```

## Overview

Team manages the coordination board under `.pi/<session-id>/team/<team-id>/`. It tracks tasks, worker messages, review gates, completion evidence, and guarded worker/reviewer/prover spawns.

## Module Structure

| Module | Description |
|--------|-------------|
| `team-compact.ts` | Prompt-efficient compact state projection. |
| `team-hud.ts` | HUD chip rendering for team status. |
| `team-runtime.ts` | State I/O, task transitions, messages, gates, completion, and snapshot/read-compact operations. |
| `team-tools.ts` | Registers `team_spawn_task_agent`, `team_spawn_review_agent`, and `team_spawn_prover_agent`. |
| `team-transitions.ts` | Skill transition table, expected-next worker selection, fail-closed gate validators. |

## Runtime Route

- Read/write envelope state through `pi workflow state team ...` with the current `sessionId`.
- Manage the team board through `pi workflow team <start|snapshot|read-compact|create-task|transition-task|send-message|record-review-gate|record-completion-gate|complete>`.
- Spawn workers through the guarded model-visible `team_spawn_task_agent` tool.
- Spawn task reviewers through `team_spawn_review_agent`; reviewers persist `review_report` with `pi workflow team record-review-gate`.
- Spawn completion provers through `team_spawn_prover_agent`; provers persist `evidence_matrix` with `pi workflow team record-completion-gate`.

Use `team_spawn_task_agent` for worker execution, `team_spawn_review_agent` for task review gates, and `team_spawn_prover_agent` for the completion evidence gate. These tools are state guarded: the harness computes the legal next team role from team state and refuses off-sequence spawns or runtime model/tool overrides.

## Workflow

1. Confirm execution is explicitly approved.
2. Start or resume a team run.
3. Split the approved plan into independent, non-overlapping tasks.
4. Persist tasks with objectives, constraints, ownership, expected output, and verification.
5. Spawn or coordinate workers.
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
