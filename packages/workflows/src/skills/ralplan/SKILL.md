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

Critical: before running any `pi workflow ralplan <action>` command, read [references/commands.md](references/commands.md) for command order and read [assets/schema.json](assets/schema.json) for the exact JSON payload shape. Every action requires `--input` or `--input-file` with the current `sessionId`; do not guess fields. Select the action schema from `x-pi-actions["<action>"]` and construct payloads from that schema.

## Boundaries

- Planning only. Do not mutate product files, commit, push, or invoke execution until the user explicitly approves execution.
- Persist planning artifacts with `pi workflow ralplan write-artifact`; do not directly edit `.pi/<session-id>/plans` or `.pi/<session-id>/workflows` unless recovering with explicit user approval.
- Explorer, Planner, Architect, Critic, and Expert passes must use the generic `subagent_spawn` tool; do not simulate workflow roles inline in the parent conversation.
- Ralplan owns role selection, prompts, tool policy, artifact commands, and state. `subagent_spawn` only executes the fully configured agent and records its generic lifecycle.
- Role passes must be sequential: explorer pre-planner gate first when required, then planner, architect, critic, revisions, and expert-stage escalation only when selected by workflow state.

## Workflow

1. Read active state with `pi workflow state` for `skill: "ralplan"`. If no state exists, initialize it with `pi workflow state` `action: write`: `active: true`, `phase: "planner"`, `data.input` set to the task or spec path. A run ID will be assigned automatically on the first artifact write. For the exact CLI/session/input split, see [State commands](../../state/commands.md).
2. Read run status with `pi workflow ralplan status --input '{"sessionId":"<current-session>"}' --json`. If resuming an existing run or state appears inconsistent, run `pi workflow ralplan doctor --input '{"sessionId":"<current-session>"}' --json` before writing new artifacts.
3. If the explorer pre-planner gate is missing or retrying, call `subagent_spawn` with `agent: "explorer"`, `role: "explorer"`, a Ralplan-specific `systemPrompt` and task, and metadata `{ "workflow":"ralplan", "owner":"ralplan", "runId":"<run-id>", "stage":"pre-planner", "stageN":1, "role":"explorer" }`; the explorer must persist `context_map` with `pi workflow ralplan record-explorer-gate`.
4. If the input is a file path, read it. If it is a task, inspect enough context to plan safely.
5. Run the Planner with `subagent_spawn` using `agent: "planner"`, `role: "planner"`, a Ralplan-specific `systemPrompt` and task, and metadata `{ "workflow":"ralplan", "owner":"ralplan", "runId":"<run-id>", "stage":"planner", "stageN":1, "role":"planner" }`. The role agent must create and persist a planner artifact containing:
   - concise problem statement
   - principles and decision drivers
   - at least two viable options, or a clear rationale for why only one remains
   - recommended approach
   - risks
   - verification plan
   - open questions
6. Confirm the Planner returned a receipt/path from `pi workflow ralplan write-artifact`. This writer is duplicate-safe and rejects conflicting rewrites of the same stage/stageN.
7. Run the Architect with `subagent_spawn` using `agent: "architect"`, `role: "architect"`, the planner artifact path in the task, and matching Ralplan metadata with `stage: "architect"`. It must review for:
   - strongest architectural objection
   - integration and ownership concerns
   - tradeoff tensions
   - synthesis or requested changes
   The Architect must persist with `stage: "architect"` and return receipt-only verdict fields.
8. Run the Critic with `subagent_spawn` using `agent: "critic"`, `role: "critic"`, planner/architect artifact paths in the task, and matching Ralplan metadata with `stage: "critic"`. It must evaluate:
   - acceptance criteria quality
   - risk mitigation
   - testability
   - missing edge cases
   - verdict: `APPROVE`, `ITERATE`, or `REJECT`
   The Critic must persist with `stage: "critic"` and return receipt-only verdict fields.
9. If the critic requests iteration, run a new Planner pass with `subagent_spawn` using `agent: "planner"`, `role: "planner"`, `stage: "revision"` metadata, and consolidated Architect/Critic feedback. Then repeat Architect/Critic review. Cap at five iterations.
10. If workflow state selects `expert-stage`, run `subagent_spawn` using `agent: "expert"`, `role: "expert"`, matching `expert-stage` metadata, and the relevant artifacts; use the expert decision to revise, approve with caveats, or stop for human input.
11. Persist the final pending-approval plan with `stage: "final"`. The tool also writes `pending-approval.md`.
12. Stop and ask for explicit execution approval. Do not execute the plan until the user explicitly approves it.
13. After explicit approval or rejection, call `pi workflow ralplan approve-plan --input '{"sessionId":"<current-session>","approved":true,"target":"ultragoal"}' --json` to close the gate. Default approved handoff is `target: "ultragoal"`; use `target: "team"` only when coordinated parallel workers are needed, or `target: "stop"` to record approval without starting another workflow.
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

## Subagent Spawn Contract

- Every Ralplan `subagent_spawn` call must provide the selected profile in `agent`, the same workflow role in `role`, an explicit Ralplan `systemPrompt`, the complete task (inline or via `task.promptFile`), and exact metadata fields `workflow`, `owner`, `runId`, `stage`, `stageN`, and `role`.
- Do not set runtime `model`, `thinkingLevel`, `tools`, or `excludeTools` overrides for guarded Ralplan passes; profiles own those defaults.
- `outputArtifact` is optional generic transport for captured assistant text. It does not replace `pi workflow ralplan record-explorer-gate` or `write-artifact`, which remain authoritative for semantic workflow state and canonical artifacts.
- For detached execution, poll with `subagent_status` or `subagent_await`; workflow completion validation runs on the terminal generic result.

## Receipt-Only Role-Agent Guidance

- Planner, Architect, and Critic role agents must persist durable output with `pi workflow ralplan write-artifact` and return receipt-only summaries (run id, stage, stage_n, path). Do not inline the full artifact text in the parent conversation.

## Current-Session Command Propagation

- Before constructing any `pi workflow ...` command, obtain the current session id by calling `ctx.sessionManager.getSessionId()`. Use that returned value as `sessionId` in every action payload; never inspect `PI_SESSION_ID`, infer an id from `.pi`, or substitute a placeholder. `--session` applies only to the separate state command.
- Keep all Ralplan state, plan artifacts, and pending-approval records under one session id for one logical planning run. Do not scatter one run across multiple `.pi/<session-id>` buckets.
- Role-agent passes require a live runtime owner for the current session so `subagent_spawn` workflow guards and completion validation can run. Run consensus inside an interactive/runtime-owner session.

## Session-Scoped Isolation

- Ralplan workflow state and plan artifacts are isolated per session. A fresh session starts with no prior plan state by construction.
- Every skill action requires `sessionId` in its JSON payload. The separate state command accepts `--session <id>`; skill actions do not use `--session` or `PI_SESSION_ID` fallback, and there is no global `.pi/` fallback.

## Corrupt-State Recovery

- If ralplan state becomes corrupt or stuck in a terminal phase, use `pi workflow state ralplan clear --force` to reset (optionally with `--session <id>`). The `--force` flag bypasses transition guards and re-seeds the state.
