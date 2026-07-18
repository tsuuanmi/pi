# Ralplan Harness

Runtime workflow for the `ralplan` skill.

**Source:** `src/harness/ralplan/`

## Overview

Ralplan coordinates durable planning passes and produces a pending-approval implementation plan before execution. Planner, Architect, Critic, Explorer, and Expert roles run through the guarded `ralplan_run_agent` model-visible tool; non-spawn state, artifact, status, doctor, and approval operations use the `pi workflow ralplan ...` command layer.

## Module Structure

| Module | Description |
|--------|-------------|
| `ralplan-agents.ts` | Role-agent prompt/profile plumbing and spawn handoff. |
| `ralplan-compact.ts` | Prompt-efficient compact run projection. |
| `ralplan-gates.ts` | Explorer/context gate validation and escalation handling. |
| `ralplan-hud.ts` | HUD chip rendering for ralplan state. |
| `ralplan-obstacles.ts` | Obstacle ledger and critic agreement helpers. |
| `ralplan-runtime.ts` | Run status, artifact index, doctor, approval, and artifact writes. |
| `ralplan-tools.ts` | Registers `ralplan_run_agent`. |
| `ralplan-transitions.ts` | Skill transition table and expected-next role selection. |
| `ralplan-verdicts.ts` | Critic verdict parsing and approval enforcement helpers. |

## Canonical Route

Use `pi workflow ralplan <action>` for non-spawn operations:

- `record-explorer-gate`
- `write-artifact`
- `status`
- `read-compact`
- `doctor`
- `approve-plan`

Use `ralplan_run_agent` for role-agent execution. It is state guarded: the harness computes the legal next role/stage from ralplan artifacts and refuses off-sequence spawns.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ralplan/state.json` | Active workflow envelope. |
| `.pi/<sessionId>/plans/ralplan/<run-id>/index.jsonl` | Append-only run index. |
| `.pi/<sessionId>/workflows/ralplan/agents/` | Role-agent records. |
| `.pi/<sessionId>/plans/ralplan/<run-id>/` | Plan artifacts and pending approval files. |

## Pending Approval

Final plans remain pending until `pi workflow ralplan approve-plan` records an explicit approval, rejection, or handoff decision. Approval refuses a latest Critic `REJECT` unless an explicit override is supplied.

## See Also

- [Ralplan skill](../../skills/ralplan/ralplan.md)
- [Shared utilities](../shared/shared.md)
- [Subagents](../subagents/subagents.md)
