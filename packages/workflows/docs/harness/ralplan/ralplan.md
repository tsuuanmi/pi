# Ralplan Workflow

Runtime workflow for the ralplan (role-augmented loop planner) skill.

**Source:** `src/harness/ralplan/`

## Overview

The ralplan workflow manages the planning state machine, persisting progress under the current session root at `.pi/<session-id>/workflows/ralplan/`. It coordinates Planner, Architect, and Critic role agents through iterative review passes.

## Module Structure

| Module | Description |
|--------|-------------|
| `ralplan-state.ts` | State types, transitions, and persistence |
| `ralplan-runtime.ts` | Main runtime loop and role coordination |
| `ralplan-tools.ts` | Tool definitions for planning phases |

## State Machine

The ralplan workflow follows these stages:

| Stage | Role | Description |
|-------|------|-------------|
| `planner` | Planner | Produces the initial plan |
| `architect` | Architect | Reviews for structural issues |
| `critic` | Critic | Identifies gaps, risks, and trade-offs |
| `revision` | Planner | Revises the plan based on feedback |
| `adr` | Planner | Records Architecture Decision Records |
| `final` | — | Plan is complete and approved |

### State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/ralplan/state.json` | Current planning state |
| `.pi/<sessionId>/workflows/ralplan/index.jsonl` | Append-only audit log |
| `.pi/<sessionId>/workflows/ralplan/agents/` | Planner/Architect/Critic role-agent records |
| `.pi/<sessionId>/plans/ralplan/<run-id>/` | Plan artifacts and ADRs |

### RalplanState

```typescript
interface RalplanState {
  phase: RalplanStage;
  plan?: string;
  feedback?: string[];
  adrs?: string[];
  startedAt: string;
  updatedAt: string;
}

type RalplanStage = "planner" | "architect" | "critic" | "revision" | "adr" | "final";
```

## Tools

The ralplan workflow exposes tools for each stage:

- `ralplan_start` — Begin a new planning cycle
- `ralplan_submit_plan` — Submit a plan for review
- `ralplan_submit_feedback` — Submit feedback from Architect or Critic
- `ralplan_submit_revision` — Submit a revised plan
- `ralplan_submit_adr` — Submit an Architecture Decision Record
- `ralplan_approve` — Mark the plan as final
- `ralplan_reject` — Reject and restart planning

## Stage Artifacts

Each stage may produce artifacts saved to the plan directory:

- `plan.md` — The main plan document
- `feedback.md` — Architect or Critic feedback
- `adr/<id>.md` — Architecture Decision Records

## Pending Approval

Plans that reach the `final` stage require explicit approval before they are considered complete:

```typescript
// File path for pending approval
ralplanPendingApprovalPath(sessionId: string): string
```

## See Also

- [Ralplan Skill](../../skills/ralplan/ralplan.md) - Skill definition and SKILL.md
- [Shared Utilities](../shared/shared.md) - Common workflow utilities