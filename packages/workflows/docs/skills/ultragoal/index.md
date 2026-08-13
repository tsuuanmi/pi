# Ultragoal Skill

Goal-tracked autonomous execution for an approved, concrete main goal through smaller checkpointed tasks.

**Source:** `src/skills/ultragoal/`

## Usage

```bash
/skill:ultragoal <approved plan or concrete task>
```

## Overview

Ultragoal owns goal selection, worker profile/prompt construction, checkpoint evidence, quality gates, obstacles, and completion state. Active goals execute through orchestrator's generic `subagent_spawn`; no Ultragoal-specific spawn tool or duplicate manager exists.

## Module structure

| Module | Description |
|--------|-------------|
| `agent-execution.ts` | Validates active-goal metadata before generic execution. |
| `artifacts.ts` | Artifact tracking and proof validation. |
| `checkpoints.ts` | Goal checkpoint transitions and restoration. |
| `goal-selection.ts` | Goal scheduling and terminal policy. |
| `guard-diagnostics.ts` | Completion and blocker diagnostics. |
| `help.ts` | Command help metadata. |
| `hud.ts` | Goal progress HUD. |
| `obstacles-service.ts` | Obstacle recording and blocker classification. |
| `obstacles.ts` | Typed obstacle persistence. |
| `plan-model.ts` | Plan parsing and normalization. |
| `plan-store.ts` | Plan, checkpoint, ledger, and state persistence. |
| `plan.ts` | Plan creation, status, reads, and goal activation. |
| `quality-gate/` | Typed completion-gate validation. |
| `receipt.ts` | Completion receipts and ledger validation. |
| `policy.ts` | Expected-next-goal policy and fail-closed validators. |

The workflow selects the legal goal and invokes `subagent_spawn` with `agent: "worker"`, `role: "worker"`, an explicit goal system prompt/task, and metadata `workflow: "ultragoal"`, `owner: "ultragoal"`, `stage: "goal-worker"`, `role: "worker"`, and the active `taskId`.

## Runtime route

- Read/write envelope state through `pi workflow state ultragoal ...`.
- Create and inspect goal state through `pi workflow ultragoal <create-plan|status>`.
- Activate a goal through `start-next`.
- Delegate the active goal through generic `subagent_spawn`; guarded calls reject off-sequence task ids and runtime model/tool overrides.
- Checkpoint/restore/record obstacles through workflow commands. Checkpoints remain the authoritative goal state even when generic `outputArtifact` captures the worker's final report.

## Workflow

1. Confirm execution approval.
2. Create a goal plan.
3. Start the next pending goal.
4. Execute it through `subagent_spawn` with the worker profile and exact metadata.
5. Checkpoint with durable evidence and quality-gate data.
6. Restore state when needed, noting that workspace files are never rolled back.
7. Resolve typed obstacles and blocker-resolution goals.
8. Complete only when all non-superseded goals have valid receipts.

## State files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ultragoal/state.json` | Active workflow envelope. |
| `.pi/<sessionId>/ultragoal/goals.json` | Goal plan. |
| `.pi/<sessionId>/ultragoal/ledger.jsonl` | Goal receipt ledger. |
| `.pi/<sessionId>/ultragoal/obstacles.json` | Typed obstacle ledger. |
| `.pi/<sessionId>/ultragoal/brief.md` | Approved goal brief. |
| `.pi/<sessionId>/ultragoal/checkpoints/*.json` | State-only checkpoint snapshots. |

## See also

- [Workflow control plane](../../workflow.md)
- [Workflow and agent execution](../../subagent/subagent.md)
