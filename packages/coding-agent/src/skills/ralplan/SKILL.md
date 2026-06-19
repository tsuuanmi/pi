---
name: ralplan
description: Consensus planning workflow that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes.
argument-hint: "[--interactive] [--deliberate] <task or spec path>"
---

# Ralplan

Ralplan is Pi's consensus planning workflow. It produces a durable pending-approval plan before execution.

## Boundaries

- Planning only. Do not mutate product files, commit, push, or invoke execution until the user explicitly approves execution.
- Persist planning artifacts with `ralplan_write_artifact`; do not directly edit `.pi/plans` or `.pi/workflows` unless recovering with explicit user approval.
- Planner, Architect, and Critic passes must use `ralplan_run_agent`; do not simulate all roles inline in the parent conversation.
- Architect and critic passes must be sequential: planner first, architect second, critic third.

## Workflow

1. Read active state with `pi_workflow_state` for `skill: "ralplan"`.
2. Read run status with `ralplan_status`. If resuming an existing run or state appears inconsistent, run `ralplan_doctor` before writing new artifacts.
3. If the input is a file path, read it. If it is a task, inspect enough context to plan safely.
4. Run the Planner with `ralplan_run_agent` using `role: "planner"`, `stage: "planner"`, and `stageN: 1`. The role agent must create and persist a planner artifact containing:
   - concise problem statement
   - principles and decision drivers
   - at least two viable options, or a clear rationale for why only one remains
   - recommended approach
   - risks
   - verification plan
   - open questions
5. Confirm the Planner returned a receipt/path from `ralplan_write_artifact`. This writer is duplicate-safe and rejects conflicting rewrites of the same stage/stageN.
6. Run the Architect with `ralplan_run_agent` using `role: "architect"`, `stage: "architect"`, and the planner artifact path in `contextArtifacts`. It must review for:
   - strongest architectural objection
   - integration and ownership concerns
   - tradeoff tensions
   - synthesis or requested changes
   The Architect must persist with `stage: "architect"` and return receipt-only verdict fields.
7. Run the Critic with `ralplan_run_agent` using `role: "critic"`, `stage: "critic"`, and planner/architect artifact paths in `contextArtifacts`. It must evaluate:
   - acceptance criteria quality
   - risk mitigation
   - testability
   - missing edge cases
   - verdict: `APPROVE`, `ITERATE`, or `REJECT`
   The Critic must persist with `stage: "critic"` and return receipt-only verdict fields.
8. If the critic requests iteration, run a Planner revision with `ralplan_run_agent` using `role: "planner"`, `stage: "revision"`, and consolidated Architect/Critic feedback. Then repeat Architect/Critic review. Cap at five iterations.
9. Persist the final pending-approval plan with `stage: "final"`. The tool also writes `pending-approval.md`.
10. Stop and ask for explicit execution approval. Do not execute the plan until the user explicitly approves it.
11. After explicit approval or rejection, call `ralplan_approve_plan` to close the gate. Default approved handoff is `target: "ultragoal"`; use `target: "team"` only when coordinated parallel workers are needed, or `target: "stop"` to record approval without starting another workflow.

## Final Plan Shape

Include:

- decision record
- selected approach and alternatives considered
- implementation steps
- acceptance criteria
- verification commands
- risk mitigations
- rollback notes when applicable
- execution approval status: `pending approval`
