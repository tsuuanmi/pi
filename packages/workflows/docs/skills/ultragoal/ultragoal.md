# Ultragoal Skill

Goal-tracked autonomous execution for an approved, concrete plan.

**Source:** `src/skills/ultragoal/SKILL.md`

## Usage

```bash
/skill:ultragoal <approved plan or concrete task>
```

## Runtime Route

- Read/write envelope state through `pi workflow state ultragoal ...` with the current `sessionId`.
- Create and inspect goal state through `pi workflow ultragoal <create-plan|status|read-compact>`.
- Advance/checkpoint goals through `pi workflow ultragoal <start-next|checkpoint|record-review-blockers|classify-blocker|guard>`.
- Spawn workers through the guarded model-visible `ultragoal_spawn_goal_agent` tool.

## Workflow

1. Confirm execution is explicitly approved.
2. Create a goal plan from the approved brief.
3. Start the next pending goal.
4. Implement the goal.
5. Checkpoint with durable evidence and quality-gate data.
6. Resolve blockers or review blockers when present.
7. Complete only when all non-superseded goals have valid completion receipts.

## Goal States

| State | Description |
|-------|-------------|
| `pending` | Goal created, not started. |
| `active` | Currently being implemented. |
| `completed` | Goal verified and done. |
| `failed` | Goal failed. |
| `blocked` | Waiting on a dependency or human decision. |
| `review_blocked` | Needs review before proceeding. |

## See Also

- [Workflow control plane](../../workflow.md)
- [Ultragoal harness](../../harness/ultragoal/ultragoal.md)
