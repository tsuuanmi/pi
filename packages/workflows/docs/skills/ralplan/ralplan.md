# Ralplan Skill

Consensus planning workflow that turns a task or Deep Interview spec into a pending-approval implementation plan.

**Source:** `src/skills/ralplan/SKILL.md`

## Usage

```bash
/skill:ralplan [--interactive] [--deliberate] <task or spec path>
```

## Runtime Route

- Read/write envelope state through `pi workflow state ralplan ...` with the current `sessionId`.
- Run role agents through the guarded model-visible `ralplan_run_agent` tool.
- Persist role artifacts through `pi workflow ralplan write-artifact` when a role agent returns an artifact receipt.
- Inspect and approve through `pi workflow ralplan <status|read-compact|doctor|approve-plan>`.

## Workflow

1. Optionally run Explorer context mapping before planning.
2. Planner produces an implementation plan candidate.
3. Architect reviews feasibility, ownership, and integration risks.
4. Critic returns `APPROVE`, `ITERATE`, or `REJECT`.
5. Planner revises on iteration until approved, rejected, escalated, or iteration-capped.
6. Final plan is persisted as pending approval.
7. Execution starts only after explicit user approval and handoff to `ultragoal`, `team`, or `stop`.

## See Also

- [Workflow control plane](../../workflow.md)
- [Ralplan harness](../../harness/ralplan/ralplan.md)
- [Deep Interview](../deep-interview/deep-interview.md)
