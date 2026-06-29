# Ralplan Workflow

Runtime workflow for the ralplan skill.

## Overview

The ralplan workflow manages the planning state machine, persisting progress under the current session root at `.pi/<session-id>/workflows/ralplan/`. It coordinates Planner, Architect, and Critic role agents through iterative review passes.

## State Files

- `.pi/<session-id>/workflows/ralplan/state.json` — Current planning state
- `.pi/<session-id>/workflows/ralplan/agents/` — Planner/Architect/Critic role-agent records
- `.pi/<session-id>/plans/ralplan/<run-id>/` — Plan artifacts

## Role Agents

| Role | Purpose |
|------|---------|
| Planner | Produces the initial plan and revisions |
| Architect | Reviews for structural issues |
| Critic | Identifies gaps, risks, and trade-offs |

## See Also

- [Ralplan Package](../../../packages/workflows/ralplan/ralplan.md) - Package-level implementation details
- [Ralplan Skill](../../skills/ralplan/ralplan.md)