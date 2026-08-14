# Ralplan Skill

Consensus planning workflow that turns a task or Deep Interview spec into a pending-approval implementation plan.

**Source:** `src/skills/ralplan/`

## Usage

```bash
/skill:ralplan [--interactive] [--deliberate] <task or spec path>
```

## Overview

Ralplan owns role selection, prompts, artifact transactions, critic verdicts, revisions, escalation, and approval. Explorer, Planner, Architect, Critic, and Expert execute through orchestrator's generic `subagent_spawn` primitive. Orchestrator receives a fully configured request and owns only the isolated runtime and generic lifecycle record.

## Module structure

| Module | Description |
|--------|-------------|
| `agent-execution.ts` | Validates Ralplan metadata before generic execution, records terminal runs, and verifies workflow artifacts. |
| `agent-roles.ts` | Stage-to-role mapping. |
| `completion-transaction.ts` | Journaled artifact/index/state completion transaction and provenance. |
| `expected-action.ts` | Pure next-action selection from the orchestration snapshot. |
| `gates.ts` | Explorer context gate validation and escalation. |
| `guards.ts` | Approval-target validation. |
| `help.ts` | Command help metadata. |
| `hud.ts` | HUD state rendering. |
| `obstacles.ts` | Obstacle ledger and critic agreement. |
| `orchestration-snapshot.ts` | Versioned read-only snapshot over state, index, artifacts, provenance, journals, and obstacles. |
| `index-store.ts` | Run index parsing and status. |
| `artifacts.ts` | Canonical stage artifact validation and persistence. |
| `approval.ts` | Pending-plan approval and handoff. |
| `approved-output.ts` | Canonical downstream workflow input. |
| `doctor.ts` | Consistency diagnostics. |
| `policy.ts` | Immutable next-role policy. |
| `verdicts.ts` | Critic/architect verdict parsing. |

## Runtime route

1. Read/write the Ralplan envelope through `pi workflow state ralplan ...`.
2. Read status/doctor output and compute the legal next role.
3. Call `subagent_spawn` with the selected profile/role, explicit Ralplan system prompt and task, and exact metadata: `workflow`, `owner`, `runId`, `stage`, `stageN`, and `role`.
4. The role agent persists semantic output through `pi workflow ralplan record-explorer-gate` or `pi workflow ralplan write-artifact` and returns a receipt-only summary.
5. The workflow result hook records the generic run under `.pi/<sessionId>/skills/ralplan/executions/` and rejects a completed run whose expected workflow artifact/provenance is incomplete.
6. Inspect and approve through `pi workflow ralplan <status|doctor|approve-plan>`.

Generic `outputArtifact` may be used as an additional transport for captured assistant output, but it does not replace Ralplan's canonical transaction writer or index.

## Workflow

1. Explorer records a context map when the gate is missing or retrying.
2. Planner produces a plan candidate.
3. Architect reviews feasibility and integration risk.
4. Critic returns `APPROVE`, `ITERATE`, or `REJECT`.
5. Planner revises until approved, rejected, escalated, or iteration-capped.
6. The final plan is persisted as pending approval.
7. Execution starts only after explicit approval and handoff.

## State files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/skills/ralplan/state.json` | Active workflow envelope. |
| `.pi/<sessionId>/artifacts/plans/ralplan/<run-id>/index.jsonl` | Append-only run index. |
| `.pi/<sessionId>/artifacts/plans/ralplan/<run-id>/stage-<stage-n>-<stage>.md` | Canonical stage artifact. |
| `.pi/<sessionId>/artifacts/plans/ralplan/<run-id>/pending-approval.md` | Pending approval plan. |
| `.pi/<sessionId>/artifacts/plans/ralplan/<run-id>/obstacles.json` | Obstacle ledger. |
| `.pi/<sessionId>/artifacts/plans/ralplan/<run-id>/gates/explorer/attempt-<nn>.json` | Explorer gate artifact. |
| `.pi/<sessionId>/skills/ralplan/executions/<subagent-id>.json` | Workflow-owned execution record linked to the generic subagent id. |

## See also

- [Workflow control plane](../../workflow.md)
- [Deep Interview](../deep-interview/index.md)
- [Workflow and agent execution](../../subagent/subagent.md)
