# Ultragoal Workflow

Runtime workflow for the ultragoal skill.

**Source:** `src/packages/workflows/runtime/ultragoal/`

## Overview

The ultragoal workflow manages the goal-tracking state machine, persisting progress under the current session root at `.pi/<session-id>/workflows/ultragoal/`. Each goal has quality gates that must pass before marking as complete.

## Module Structure

| Module | Description |
|--------|-------------|
| `ultragoal-runtime.ts` | Main runtime loop and goal coordination |
| `ultragoal-tools.ts` | Tool definitions for goal management |
| `ultragoal-quality-gate.ts` | Quality gate evaluation |
| `ultragoal-artifacts.ts` | Artifact tracking and validation |
| `ultragoal-guard.ts` | State mutation guard |
| `ultragoal-receipt.ts` | Receipt generation for mutations |
| `ultragoal-hud.ts` | HUD rendering for goal progress |

## State Machine

Each goal follows these phases:

| Phase | Description |
|-------|-------------|
| `pending` | Goal is defined but not started |
| `in_progress` | Goal is being worked on |
| `evidence` | Evidence is being collected |
| `review` | Quality gates are being evaluated |
| `complete` | Goal has passed all quality gates |
| `failed` | Goal has failed |

### State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ultragoal/state.json` | Current goal state |
| `.pi/<sessionId>/ultragoal/goals.json` | Goal definitions |
| `.pi/<sessionId>/ultragoal/ledger.jsonl` | Goal transition log |

### UltragoalState

```typescript
interface UltragoalState {
  goals: Goal[];
  currentGoalIndex: number;
  phase: UltragoalPhase;
  startedAt: string;
  updatedAt: string;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: GoalStatus;
  evidence?: GoalEvidence;
  qualityGates?: QualityGateResult[];
}
```

## Quality Gates

Each goal completion requires passing quality gates:

1. **Evidence**: Summary of what was done
2. **Surface Evidence**: Verification that the goal criteria are met
3. **Contract Coverage**: Each acceptance criterion is covered
4. **Executor QA**: Artifact references and verification

```typescript
interface QualityGateResult {
  gate: string;           // "evidence" | "surface_evidence" | "contract_coverage" | "executor_qa"
  passed: boolean;
  details: string;
  artifacts?: string[];
}
```

## Tools

The ultragoal workflow exposes tools for goal management:

- `ultragoal_spawn_goal_agent` — Spawn a subagent for a goal
- `ultragoal_submit_evidence` — Submit goal completion evidence
- `ultragoal_evaluate_gates` — Evaluate quality gates for a goal
- `ultragoal_update_goal` — Update goal status
- `ultragoal_get_status` — Get current ultragoal status

## Mutation Guard

The `ultragoal-guard.ts` module validates state mutations to ensure:
- Goal phase transitions are valid
- Evidence is provided before marking a goal complete
- Quality gates are evaluated before advancing
- Goal indices are within bounds

## Artifacts

Artifacts are tracked by `ultragoal-artifacts.ts`:

```typescript
interface Artifact {
  path: string;           // File path
  type: string;           // "file" | "command" | "test"
  description: string;
  verified: boolean;
}
```

## Ledger

The ledger is an append-only JSONL file recording every goal transition:

```jsonl
{"goalId":"g1","from":"pending","to":"in_progress","timestamp":"...","evidence":"..."}
{"goalId":"g1","from":"in_progress","to":"complete","timestamp":"...","gates":{"evidence":true,"surface_evidence":true,"contract_coverage":true,"executor_qa":true}}
```

## See Also

- [Ultragoal Skill](../../../skills/ultragoal/ultragoal.md) - Skill definition and SKILL.md
- [Subagents](../../../core/subagents/subagents.md) - Pi-native SubagentManager
- [Shared Utilities](../shared/shared.md) - Common workflow utilities