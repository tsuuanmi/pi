# Ralplan Skill

Consensus planning workflow that turns a task or Deep Interview spec into a pending-approval implementation plan.

**Source:** `src/skills/ralplan/`

## Usage

```bash
/skill:ralplan [--interactive] [--deliberate] <task or spec path>
```

## Overview

Ralplan coordinates durable planning passes and produces a pending-approval implementation plan before execution. Planner, Architect, Critic, Explorer, and Expert roles run through the guarded `ralplan_run_agent` model-visible tool; non-spawn state, artifact, status, doctor, and approval operations use the `pi workflow ralplan ...` command layer.

## Module Structure

| Module | Description |
|--------|-------------|
| `agent.ts` | Role types, stage mapping, and prompt request construction. |
| `agent-adapter.ts` | Workflow role request to Pi-native `Agent` adapter. |
| `orchestrator.ts` | Guarded single-stage execution through `@tsuuanmi/pi-orchestrator`. |
| `checkpoint.ts` | Session-scoped orchestrator checkpoint storage. |
| `record.ts` | Durable role-agent run records. |
| `compact.ts` | Prompt-efficient compact run projection. |
| `completion-transaction.ts` | Journaled completion transaction: intent journal, stage artifact + index writes, obstacle ledger update, completion provenance sidecar, and committed/rolled-back markers. |
| `expected-action.ts` | Pure `selectExpectedRalplanAction` over the orchestration snapshot; returns the next spawn/closed/blocked/no-action decision. |
| `gates.ts` | Explorer/context gate validation and escalation handling. |
| `hud.ts` | HUD chip rendering for ralplan state. |
| `obstacles.ts` | Obstacle ledger and critic agreement helpers. |
| `orchestration-snapshot.ts` | Reads workflow state, run index, explorer gate, artifact hashes, completion provenance, transaction journals, and obstacle ledger without repairing them, then emits a versioned fingerprint over canonically ordered data. |
| `runtime.ts` | Run status, artifact index, doctor, approval, and artifact writes. |
| `tools.ts` | Registers `ralplan_run_agent`. |
| `transitions.ts` | Skill transition table and expected-next role selection. |
| `verdicts.ts` | Critic verdict parsing and approval enforcement helpers. |

## Runtime Route

- Read/write envelope state through `pi workflow state ralplan ...` with the current `sessionId`.
- Run explorer, planner, architect, critic, revision, and expert-stage agents through the guarded model-visible `ralplan_run_agent` tool. The tool submits one admitted role task to the workflow-owned Orchestrator adapter.
- Persist explorer context through `pi workflow ralplan record-explorer-gate` and role artifacts through `pi workflow ralplan write-artifact`.
- Inspect and approve through `pi workflow ralplan <status|read-compact|doctor|approve-plan>`.

Use `ralplan_run_agent` for role-agent execution. It is state guarded: the harness computes the legal next role/stage from Ralplan artifacts, refuses off-sequence execution, and verifies the current stage artifact before the task can complete.

The Orchestrator owns task execution, agent invocation, checkpointing, and task receipts. Ralplan owns role selection, critic verdicts, revision and expert branching, artifact transactions, approval, and workflow receipts. The first integration executes one admitted stage per Orchestrator run so conditional Ralplan loops remain workflow policy.

## Workflow

1. Run Explorer context mapping before planning when the pre-planner gate is missing or retrying.
2. Planner produces an implementation plan candidate.
3. Architect reviews feasibility, ownership, and integration risks.
4. Critic returns `APPROVE`, `ITERATE`, or `REJECT`.
5. Planner revises on iteration until approved, rejected, escalated, or iteration-capped.
6. Final plan is persisted as pending approval.
7. Execution starts only after explicit user approval and handoff to `ultragoal`, `team`, or `stop`.

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

- [Workflow control plane](../../workflow.md)
- [Deep Interview](../deep-interview/index.md)
- [Subagents and workflow tools](../../subagents/subagents.md)
- [Ralplan Orchestrator contract](../../../../../docs/architecture/ralplan-orchestrator-contract.md)
