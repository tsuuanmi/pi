---
name: ralplan
description: Consensus planning workflow that turns a task or deep-interview spec into a pending-approval implementation plan using planner, architect, and critic passes.
argument-hint: "[--interactive] [--deliberate] <task or spec path>"
---

# Ralplan

Ralplan is Pi's consensus planning workflow. It produces a durable pending-approval plan before execution.

## Skill Resources

- Workflow command guide: [references/commands.md](references/commands.md)
- JSON payload schema for `pi workflow ralplan <action>`: [assets/schema.json](assets/schema.json)

Critical: before running any `pi workflow ralplan <action>` command, read [references/commands.md](references/commands.md) for command order and read [assets/schema.json](assets/schema.json) for the exact JSON payload shape. Do not guess `--input` or `--input-file` fields; select the action schema from `x-pi-actions["<action>"]` and construct payloads from that schema.

## Boundaries

- Planning only. Do not mutate product files, commit, push, or invoke execution until the user explicitly approves execution.
- Persist planning artifacts with `pi workflow ralplan write-artifact`; do not directly edit `.pi/<session-id>/plans` or `.pi/<session-id>/workflows` unless recovering with explicit user approval.
- Explorer, Planner, Architect, Critic, and Expert passes must use the `ralplan_run_agent` tool; do not simulate workflow roles inline in the parent conversation.
- Role passes must be sequential: explorer pre-planner gate first when required, then planner, architect, critic, revisions, and expert-stage escalation only when selected by workflow state.

## Workflow

1. Read active state with `pi workflow state` for `skill: "ralplan"`. If no state exists, initialize it with `pi workflow state` `action: write`: `active: true`, `phase: "planner"`, `data.input` set to the task or spec path. A run ID will be assigned automatically on the first artifact write. For the exact CLI/session/input split, see [State commands](../../state/commands.md).
2. Read run status with `pi workflow ralplan status`. If resuming an existing run or state appears inconsistent, run `pi workflow ralplan doctor` before writing new artifacts.
3. If the explorer pre-planner gate is missing or retrying, run `ralplan_run_agent` with `role: "explorer"`, `stage: "pre-planner"`, and `stageN: 1`; the explorer must persist `context_map` with `pi workflow ralplan record-explorer-gate`.
4. If the input is a file path, read it. If it is a task, inspect enough context to plan safely.
5. Run the Planner with the `ralplan_run_agent` tool using `role: "planner"`, `stage: "planner"`, and `stageN: 1`. The role agent must create and persist a planner artifact containing:
   - concise problem statement
   - principles and decision drivers
   - at least two viable options, or a clear rationale for why only one remains
   - recommended approach
   - risks
   - verification plan
   - open questions
6. Confirm the Planner returned a receipt/path from `pi workflow ralplan write-artifact`. This writer is duplicate-safe and rejects conflicting rewrites of the same stage/stageN.
7. Run the Architect with the `ralplan_run_agent` tool using `role: "architect"`, `stage: "architect"`, and the planner artifact path in `contextArtifacts`. It must review for:
   - strongest architectural objection
   - integration and ownership concerns
   - tradeoff tensions
   - synthesis or requested changes
   The Architect must persist with `stage: "architect"` and return receipt-only verdict fields.
8. Run the Critic with the `ralplan_run_agent` tool using `role: "critic"`, `stage: "critic"`, and planner/architect artifact paths in `contextArtifacts`. It must evaluate:
   - acceptance criteria quality
   - risk mitigation
   - testability
   - missing edge cases
   - verdict: `APPROVE`, `ITERATE`, or `REJECT`
   The Critic must persist with `stage: "critic"` and return receipt-only verdict fields.
9. If the critic requests iteration, run a Planner revision with the `ralplan_run_agent` tool using `role: "planner"`, `stage: "revision"`, and consolidated Architect/Critic feedback. Then repeat Architect/Critic review. Cap at five iterations.
10. If workflow state selects `expert-stage`, run `ralplan_run_agent` with `role: "expert"`, `stage: "expert-stage"`, and the relevant artifacts; use the expert decision to revise, approve with caveats, or stop for human input.
11. Persist the final pending-approval plan with `stage: "final"`. The tool also writes `pending-approval.md`.
12. Stop and ask for explicit execution approval. Do not execute the plan until the user explicitly approves it.
13. After explicit approval or rejection, call `pi workflow ralplan approve-plan` to close the gate. Default approved handoff is `target: "ultragoal"`; use `target: "team"` only when coordinated parallel workers are needed, or `target: "stop"` to record approval without starting another workflow.
14. `pi workflow ralplan approve-plan` enforces the latest critic verdict: it refuses to approve when the latest critic verdict is REJECT (set `overrideCriticVerdict: true` to force approval), and warns when it is ITERATE (e.g. the plan was revised but not re-reviewed by the critic). `pi workflow ralplan doctor` surfaces the same signal as a warning while a plan is pending. Do not approve over a REJECT without an explicit override decision.

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

- Planner, Architect, and Critic role agents must persist durable output with `pi workflow ralplan write-artifact` and return receipt-only summaries (run id, stage, stage_n, path). Do not inline the full artifact text in the parent conversation.

## Current-Session Command Propagation

- When running inside an interactive Pi session, pass the current session id into every `pi workflow ...` command input as `sessionId`. Use `ctx.sessionManager.getSessionId()` (or the equivalent session source) — do not rely on `PI_SESSION_ID`/`--session` fallback during skill execution.
- Keep all Ralplan state, plan artifacts, and pending-approval records under one session id for one logical planning run. Do not scatter one run across multiple `.pi/<session-id>` buckets.
- Role-agent passes (`run-agent`) require a live runtime owner for the current session; a one-shot CLI command without a live owner will fail closed. Run consensus inside an interactive/runtime-owner session.

## Session-Scoped Isolation

- Ralplan workflow state and plan artifacts are isolated per session. A fresh session starts with no prior plan state by construction.
- A session id is required (resolved from the active session by the tools; `--session <id>` or `PI_SESSION_ID` for the CLI). There is no global `.pi/` fallback.

## Corrupt-State Recovery

- If ralplan state becomes corrupt or stuck in a terminal phase, use `pi workflow state ralplan clear --force` to reset (optionally with `--session <id>`). The `--force` flag bypasses transition guards and re-seeds the state.
