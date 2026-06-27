# Ultragoal Skill

Goal-tracked autonomous execution for an approved, concrete plan.

## Overview

The ultragoal skill breaks an approved plan into sequential goals, tracks progress through quality gates, and ensures each goal is verified before moving to the next.

## Usage

```bash
/skill:ultragoal <approved plan or concrete task>
```

## Workflow

1. Create a goal plan from the approved brief
2. Start the next pending goal
3. Implement the goal
4. Checkpoint with evidence and quality gate
5. Move to the next goal
6. Complete when all goals are done

## Goal States

| State | Description |
|-------|-------------|
| `pending` | Goal created, not started |
| `active` | Currently being implemented |
| `completed` | Goal verified and done |
| `failed` | Goal failed |
| `blocked` | Goal blocked on dependency |
| `review_blocked` | Needs review before proceeding |

## See Also

- [Workflow](../../workflows/workflow.md) - Pi workflow control plane