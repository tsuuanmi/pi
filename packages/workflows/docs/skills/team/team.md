# Team Skill

Coordinate parallel implementation workers after an approved plan exists.

**Source:** `src/skills/team/SKILL.md`

## Usage

```bash
/skill:team <approved plan or task>
```

## Runtime Route

- Read/write envelope state through `pi workflow state team ...` with the current `sessionId`.
- Manage the team board through `pi workflow team <start|snapshot|read-compact|create-task|transition-task|send-message|record-review-gate|record-completion-gate|complete>`.
- Spawn workers through the guarded model-visible `team_spawn_task_agent` tool.
- Spawn task reviewers through `team_spawn_review_agent`; reviewers persist `review_report` with `pi workflow team record-review-gate`.
- Spawn completion provers through `team_spawn_prover_agent`; provers persist `evidence_matrix` with `pi workflow team record-completion-gate`.

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

## See Also

- [Workflow control plane](../../workflow.md)
- [Team harness](../../harness/team/team.md)
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md)
