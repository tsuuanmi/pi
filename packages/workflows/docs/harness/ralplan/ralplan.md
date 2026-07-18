# Ralplan Workflow

Runtime workflow for the ralplan skill.

**Source:** `src/harness/ralplan/`

## Overview

Ralplan coordinates durable planning passes and produces a pending-approval implementation plan before execution. Planner, Architect, Critic, Explorer, and Expert roles are dispatched through the workflow control plane, not model-visible workflow tools.

## Module Structure

| Module | Description |
|--------|-------------|
| `ralplan-runtime.ts` | Run status, artifact index, doctor, approval, and role-agent orchestration |
| `ralplan-agents.ts` | Role-agent prompt/profile plumbing |
| `ralplan-transitions.ts` | Skill transition table and expected-next role selection |
| `ralplan-context-gate.ts` | Explorer context-map gate validation |
| `ralplan-obstacles.ts` | Obstacle ledger and critic agreement helpers |

## Canonical Route

Use the `pi workflow ralplan <action>` control plane. The removed `ralplan_*` model-visible tools are not registered.

Supported actions include:

- `record-explorer-gate`
- `run-agent`
- `write-artifact`
- `status`
- `read-compact`
- `doctor`
- `approve-plan`

`run-agent` is state guarded: it computes the legal next role/stage from ralplan artifacts and refuses off-sequence spawns.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ralplan/state.json` | Active workflow envelope |
| `.pi/<sessionId>/plans/ralplan/<run-id>/index.jsonl` | Append-only run index |
| `.pi/<sessionId>/workflows/ralplan/agents/` | Role-agent records |
| `.pi/<sessionId>/plans/ralplan/<run-id>/` | Plan artifacts and pending approval files |

## Pending Approval

Final plans remain pending until `pi workflow ralplan approve-plan` records an explicit approval, rejection, or handoff decision. Approval refuses a latest Critic `REJECT` unless an explicit override is supplied.

## See Also

- [Shared Utilities](../shared/shared.md) - Common workflow utilities
- [Subagents](../subagents/subagents.md) - Workflow subagent control plane
