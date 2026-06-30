# Ralplan Skill

Consensus planning workflow that turns a task or deep-interview spec into a pending-approval implementation plan.

## Overview

Ralplan uses three role agents — Planner, Architect, and Critic — to produce a robust implementation plan through iterative review.

## Usage

```bash
/skill:ralplan [--interactive] [--deliberate] <task or spec path>
```

| Flag | Description |
|------|-------------|
| `--interactive` | Require user approval at each stage |
| `--deliberate` | Enable deeper deliberation passes |

## Workflow

1. **Planner** produces an initial plan
2. **Architect** reviews for structural issues
3. **Critic** identifies gaps and risks
4. **Planner** revises based on feedback
5. Final plan is written and awaits user approval

## See Also

- [Workflow](../workflow.md) - Pi workflow control plane
- [Deep Interview](../deep-interview/deep-interview.md) - Requirements gathering