# Team Skill

Coordinate parallel implementation workers after an approved plan exists.

## Overview

The team skill creates a coordination board with multiple workers, each assigned independent tasks from an approved plan. Workers run as subagent sessions.

## Usage

```bash
/skill:team <approved plan or task>
```

## Workflow

1. Parse the approved plan into independent tasks
2. Create a team coordination board
3. Spawn workers for each task
4. Track progress and handle dependencies
5. Integrate results when all tasks complete

## Task States

| State | Description |
|-------|-------------|
| `pending` | Task created, not started |
| `active` | Worker is running |
| `blocked` | Waiting on dependencies |
| `completed` | Task finished successfully |
| `failed` | Task failed |

## See Also

- [Workflow](../../workflows/workflow.md) - Pi workflow control plane
- [Subagents](../../core/subagents/subagents.md) - Subagent execution