# Ultragoal Workflow

Runtime workflow for the ultragoal skill.

**Source:** `src/harness/ultragoal/`

## Overview

The ultragoal workflow manages goal-tracked execution under the current session root. Each goal must produce durable checkpoint evidence and pass completion receipt validation before the workflow can close.

## Module Structure

| Module | Description |
|--------|-------------|
| `ultragoal-runtime.ts` | Plan/state I/O and goal transitions |
| `ultragoal-transitions.ts` | Skill transition table, expected-next goal selection, fail-closed validators |
| `ultragoal-quality-gate.ts` | Quality gate schema validation |
| `ultragoal-artifacts.ts` | Artifact tracking and validation |
| `ultragoal-guard.ts` | Completion/blocker guard logic |
| `ultragoal-receipt.ts` | Receipt and ledger validation |
| `ultragoal-hud.ts` | HUD rendering for goal progress |

## Canonical Route

Use the `pi workflow ultragoal <action>` control plane. The removed `ultragoal_*` model-visible tools are not registered.

Supported actions include:

- `create-plan`
- `status`
- `read-compact`
- `start-next`
- `checkpoint`
- `record-review-blockers`
- `classify-blocker`
- `guard`
- `spawn-goal-agent`

`spawn-goal-agent` is state guarded: it computes the legal next goal from ultragoal state and refuses off-sequence spawns or runtime model/tool overrides.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ultragoal/state.json` | Active workflow envelope |
| `.pi/<sessionId>/ultragoal/goals.json` | Goal plan |
| `.pi/<sessionId>/ultragoal/ledger.jsonl` | Goal receipt ledger |

## Gates

- Completion requires every non-superseded goal to be complete.
- Completed goals must have valid completion receipts against the plan and ledger.
- Blocked or failed goals remain human blockers until explicitly classified/resolved.

## See Also

- [Subagents](../subagents/subagents.md) - Workflow subagent control plane
- [Shared Utilities](../shared/shared.md) - Common workflow utilities
