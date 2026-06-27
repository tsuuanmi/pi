# Ralplan Workflow

Runtime workflow for the ralplan skill.

## Overview

The ralplan workflow manages the planning state machine, persisting progress to `.pi/workflows/ralplan/`. It coordinates Planner, Architect, and Critic role agents through iterative review passes.

## State Files

- `.pi/workflows/ralplan/state.json` — Current planning state
- `.pi/plans/ralplan/<run-id>/` — Plan artifacts

## Role Agents

| Role | Purpose |
|------|---------|
| Planner | Produces the initial plan and revisions |
| Architect | Reviews for structural issues |
| Critic | Identifies gaps, risks, and trade-offs |

## See Also

- [Ralplan Skill](../../skills/ralplan/ralplan.md)