# Ultragoal Skill

Goal-tracked autonomous execution for an approved, concrete main goal through smaller checkpointed tasks.

**Source:** `src/skills/ultragoal/`

## Usage

```bash
/skill:ultragoal <approved plan or concrete task>
```

## Overview

Ultragoal manages goal-tracked execution under the current session root. One main goal is decomposed into task goals. Each task goal must produce durable checkpoint evidence and pass completion receipt validation before the workflow can close.

## Module Structure

| Module | Description |
|--------|-------------|
| `artifacts.ts` | Artifact tracking and structural proof validation. |
| `checkpoints.ts` | Goal checkpoint transitions and checkpoint restoration. |
| `goal-selection.ts` | Goal scheduling and terminal-state policy. |
| `guard.ts` | Completion and blocker diagnostics. |
| `help.ts` | Command action descriptions, typed arguments, and help metadata. |
| `hud.ts` | HUD chip rendering for goal progress. |
| `obstacle-service.ts` | Obstacle recording and blocker classification. |
| `obstacles.ts` | Authoritative obstacle-ledger model and persistence. |
| `plan-model.ts` | Plan parsing and normalization. |
| `plan-store.ts` | Plan, checkpoint, ledger, and workflow-state persistence. |
| `plan.ts` | Plan creation, status, reads, and goal activation. |
| `quality-gate/` | Typed completion-gate validation; see [Quality gate](quality-gate/). |
| `receipt.ts` | Completion receipts and ledger validation. |
| `surface.ts` | Validated command and model-visible tool surface metadata. |
| `tools.ts` | Registers `ultragoal_spawn_goal_agent`. |
| `types.ts` | Shared Ultragoal application types. |
| `policy.ts` | Immutable skill policy, expected-next goal selection, and fail-closed validators. |

## Runtime Route

- Read/write envelope state through `pi workflow state ultragoal ...` with the current `sessionId`.
- Create and inspect goal state through `pi workflow ultragoal <create-plan|status>`.
- Advance/checkpoint goals through `pi workflow ultragoal <start-next|checkpoint|restore-checkpoint|record-obstacle|classify-blocker|guard>`.
- Spawn workers through the guarded model-visible `ultragoal_spawn_goal_agent` tool.

Use `ultragoal_spawn_goal_agent` for worker execution. It always spawns the standard `worker` agent profile. It is state guarded: the harness computes the legal next goal from ultragoal state and refuses off-sequence spawns or runtime model/tool overrides.

## Workflow

1. Confirm execution is explicitly approved.
2. Create a goal plan from the approved brief.
3. Start the next pending goal.
4. Implement the goal.
5. Checkpoint with durable evidence and quality-gate data; accepted checkpoints write state-only restore snapshots.
6. If later work fails, optionally restore Ultragoal state to the latest valid checkpoint with `restore-checkpoint`.
7. Record typed obstacles and complete their blocker-resolution goals when present.
8. Complete only when all non-superseded goals have valid completion receipts.

## Goal States

| State | Description |
|-------|-------------|
| `pending` | Goal created, not started. |
| `active` | Currently being implemented. |
| `completed` | Goal verified and done. |
| `failed` | Goal failed. |
| `blocked` | Waiting on a dependency or human decision. |
| `review_blocked` | Needs review before proceeding. |

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ultragoal/state.json` | Active workflow envelope. |
| `.pi/<sessionId>/ultragoal/goals.json` | Goal plan. |
| `.pi/<sessionId>/ultragoal/ledger.jsonl` | Goal receipt ledger. |
| `.pi/<sessionId>/ultragoal/obstacles.json` | Authoritative typed obstacle ledger; malformed state fails closed. |
| `.pi/<sessionId>/ultragoal/brief.md` | Approved goal brief. |
| `.pi/<sessionId>/ultragoal/checkpoints/*.json` | State-only checkpoint snapshots for restore. |

## Gates

- Completion requires every non-superseded goal to be complete.
- Completed goals must have valid completion receipts against the plan and ledger.
- Checkpoint snapshot ledger rows are bookkeeping and do not change receipt freshness.
- Blocked or failed goals remain human blockers until explicitly classified/resolved.
- Checkpoint restore fails closed on missing/corrupt/tampered snapshots, stale expected plan hashes from `status.planHash`, or main-goal/task identity drift. Restore never rolls back workspace files.

## See Also

- [Workflow control plane](../../workflow.md)
- [Subagents and workflow tools](../../subagents/subagents.md)
