---
name: ralplan
description: Consensus planning workflow that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes.
argument-hint: "[--interactive] [--deliberate] <task or spec path>"
---

# Ralplan

Ralplan is Pi's consensus planning workflow. It produces a durable pending-approval plan before execution.

## Boundaries

- Planning only. Do not mutate product files, commit, push, or invoke execution until the user explicitly approves execution.
- Persist planning artifacts with `ralplan_write_artifact`; do not directly edit `.pi/<session-id>/plans` or `.pi/<session-id>/workflows` unless recovering with explicit user approval.
- Planner, Architect, and Critic passes must use `ralplan_run_agent`; do not simulate all roles inline in the parent conversation.
- Architect and critic passes must be sequential: planner first, architect second, critic third.

## Workflow

1. Read active state with `pi_workflow_state` for `skill: "ralplan"`. If no state exists, initialize it with `pi_workflow_state` `action: write`: `active: true`, `phase: "planner"`, `data.input` set to the task or spec path. A run ID will be assigned automatically on the first artifact write.
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
12. `ralplan_approve_plan` enforces the latest critic verdict: it refuses to approve when the latest critic verdict is REJECT (set `overrideCriticVerdict: true` to force approval), and warns when it is ITERATE (e.g. the plan was revised but not re-reviewed by the critic). `ralplan_doctor` surfaces the same signal as a warning while a plan is pending. Do not approve over a REJECT without an explicit override decision.

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

## Pre-Execution Vagueness Gate

- When `team` or `ultragoal` is dispatched with a vague prompt (no concrete signals and ≤ 15 words), the workflow tools redirect to `ralplan` with an explanatory message instead of starting execution. Concrete signals that pass the gate include: file paths, issue references (`#123`), snake_case/CamelCase symbols, numbered steps, acceptance/criteria/must/should language, error/exception/traceback, fenced code blocks.
- The gate checks specificity, not file existence — a prompt naming a not-yet-created file still passes.
- Prefix the prompt with `force:` or `!` to bypass the vagueness gate.

## Receipt-Only Role-Agent Guidance

- Planner, Architect, and Critic role agents must persist durable output with `ralplan_write_artifact` and return receipt-only summaries (run id, stage, stage_n, path). Do not inline the full artifact text in the parent conversation.

## Session-Scoped Isolation

- Ralplan workflow state and plan artifacts are isolated per session. A fresh session starts with no prior plan state by construction.
- A session id is required (resolved from the active session by the tools; `--session <id>` or `PI_SESSION_ID` for the CLI). There is no global `.pi/` fallback.

## Corrupt-State Recovery

- If ralplan state becomes corrupt or stuck in a terminal phase, use `pi workflow state ralplan clear --force` to reset (optionally with `--session <id>`). The `--force` flag bypasses transition guards and re-seeds the state.
