# Ultragoal Harness

Runtime workflow for the `ultragoal` skill.

**Source:** `src/skills/ultragoal/`

## Overview

Ultragoal manages goal-tracked execution under the current session root. Each goal must produce durable checkpoint evidence and pass completion receipt validation before the workflow can close.

## Module Structure

| Module | Description |
|--------|-------------|
| `ultragoal-artifacts.ts` | Artifact tracking and validation. |
| `ultragoal-compact.ts` | Prompt-efficient compact goal projection. |
| `ultragoal-guard.ts` | Completion/blocker guard logic. |
| `ultragoal-hud.ts` | HUD chip rendering for goal progress. |
| `ultragoal-obstacles.ts` | Obstacle/blocker ledger helpers. |
| `ultragoal-quality-gate.ts` | Quality gate schema validation. |
| `ultragoal-receipt.ts` | Receipt and ledger validation. |
| `ultragoal-runtime.ts` | Plan/state I/O and goal transitions. |
| `ultragoal-tools.ts` | Registers `ultragoal_spawn_goal_agent`. |
| `ultragoal-transitions.ts` | Skill transition table, expected-next goal selection, fail-closed validators. |

## Canonical Route

Use `pi workflow ultragoal <action>` for non-spawn operations:

- `create-plan`
- `status`
- `read-compact`
- `start-next`
- `checkpoint`
- `record-review-blockers`
- `classify-blocker`
- `guard`

Use `ultragoal_spawn_goal_agent` for worker execution. It is state guarded: the harness computes the legal next goal from ultragoal state and refuses off-sequence spawns or runtime model/tool overrides.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ultragoal/state.json` | Active workflow envelope. |
| `.pi/<sessionId>/ultragoal/goals.json` | Goal plan. |
| `.pi/<sessionId>/ultragoal/ledger.jsonl` | Goal receipt ledger. |

## Gates

- Completion requires every non-superseded goal to be complete.
- Completed goals must have valid completion receipts against the plan and ledger.
- Blocked or failed goals remain human blockers until explicitly classified/resolved.

## See Also

- [Ultragoal skill](../../skills/ultragoal/ultragoal.md)
- [Subagents](../subagents/subagents.md)
- [Shared utilities](../shared/shared.md)
