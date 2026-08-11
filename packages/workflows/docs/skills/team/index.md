# Team Skill

Coordinate parallel implementation workers after an approved plan exists.

**Source:** `src/skills/team/`

## Usage

```bash
/skill:team <approved plan or task>
```

## Overview

Team manages the coordination board under `.pi/<session-id>/team/<team-id>/`. It tracks tasks, worker messages, review gates, completion evidence, and guarded worker/reviewer/prover execution.

## Module Structure

| Module | Description |
|--------|-------------|
| `agent-adapter.ts` | Adapts Team role requests to the Pi-native agent interface. |
| `checkpoint-store.ts` | Persists and validates session-scoped orchestrator checkpoints. |
| `validation.ts` | Strictly parses persisted Team records and validates new task/evidence inputs. |
| `coordinator.ts` | Selects the legal role and submits its batch to the Orchestrator. |
| `dependencies.ts` | Validates the durable task graph through Orchestrator primitives and admits ready tasks. |
| `event-mapper.ts` | Maps Orchestrator `TaskQueueEvent` values to workflow-owned `TeamWorkflowEvent` projections. |
| `event-store.ts` | Persists `TeamWorkflowEvent` records with deterministic idempotency keys. |
| `execution-applier.ts` | Applies Orchestrator task updates and receipt references to a Team snapshot. |
| `execution-failure.ts` | Builds durable failed execution state. |
| `execution-store.ts` | Persists task execution state. |
| `execution.ts` | Runs Team role execution and applies success or failure outcomes. |
| `help.ts` | Command action descriptions, typed arguments, and help metadata. |
| `gates.ts` | Records review/completion evidence and enforces gate-controlled transitions. |
| `hud.ts` | HUD chip rendering for Team status. |
| `messages.ts` | Persists Team mailbox messages. |
| `orchestrator-checkpoint.ts` | Serializes and validates Orchestrator checkpoint data. |
| `orchestrator.ts` | Team integration with `@tsuuanmi/pi-orchestrator`. |
| `receipt-mapper.ts` | Maps Orchestrator task receipts to Team receipt references. |
| `receipt-store.ts` | Persists role receipts with idempotent keys. |
| `role-contract.ts` | Validates required reviewer/prover workflow evidence. |
| `role-run-store.ts` | Persists failures and records for synthetic and concrete role runs. |
| `role-tasks.ts` | Builds worker, reviewer, and prover task batches. |
| `role-transitions.ts` | Applies workflow-owned transitions after successful role execution. |
| `state.ts` | Starts teams and synchronizes workflow snapshots and HUD state. |
| `status-mapper.ts` | Maps Orchestrator task statuses to Team task statuses. |
| `store.ts` | Owns Team configuration, task, event, and active-team persistence. |
| `surface.ts` | Validated command and model-visible tool surface metadata. |
| `task-mapper.ts` | Maps workflow task data to Orchestrator task inputs. |
| `tasks.ts` | Creates tasks and enforces task lifecycle transitions. |
| `tools.ts` | Registers `team_execute` and `team_resume`. |
| `types.ts` | Defines Team domain models and persisted contracts. |
| `policy.ts` | Immutable skill policy, expected-next worker selection, and fail-closed gate validators. |

## Runtime Route

- Read/write envelope state through `pi workflow state team ...` with the current `sessionId`.
- Manage the team board through `pi workflow team <start|snapshot|create-task|transition-task|send-message|record-review-gate|record-completion-gate|complete>`.
- Execute workers through the model-visible `team_execute` tool.
- Execute task reviewers through `team_execute`; reviewers persist `review_report` with `pi workflow team record-review-gate`.
- Execute completion provers through `team_execute`; provers persist `evidence_matrix` with `pi workflow team record-completion-gate`.

Use `team_execute` for worker, reviewer, and prover execution, and `team_resume` only for recovery of an interrupted `running` checkpoint. Completed and aborted checkpoints are terminal; retrying an aborted role requires a fresh `team_execute` run. Checkpoint saves are always strict and any persistence failure aborts the run; callers cannot select best-effort persistence. Worker and reviewer runs require a running team; the legal prover run is allowed during `awaiting_integration`. A reviewer or prover result succeeds only when its gate status is `passed` and its structured verdict validates and passes. The coordinator computes the legal next team role and refuses off-sequence execution or implicit checkpoint reuse.

## Workflow

1. Confirm execution is explicitly approved.
2. Start or resume a team run.
3. Split the approved plan into independent, non-overlapping tasks.
4. Persist tasks with objectives, constraints, ownership, expected output, and verification.
5. Execute the selected role through `team_execute` or recover it with `team_resume`.
6. Record progress, messages, review gates, and completion evidence.
7. Integrate results and close only after required gates pass.

## Task States

| State | Description |
|-------|-------------|
| `pending` | Task created, not started. |
| `in_progress` | Worker is running. |
| `blocked` | Waiting on dependency or human decision. |
| `completed` | Task finished and passed required gates. |
| `failed` | Task failed. |

## Role Routing

| Role | Required capability |
|------|---------------------|
| worker | `worker` |
| reviewer | `reviewer` |
| prover | `prover` |

Role capability matching is exact. Missing capabilities and duplicate agent ids fail before execution; no alternate agent or capability is selected. A worker task is admitted only after every `depends_on` task is complete and `blocked_by` is empty. Because each Team role run contains one admitted task, completed historical dependencies are not copied into that Orchestrator run.

## State Files

| File | Description |
|------|-------------|
| `.pi/<session-id>/team/<teamId>/config.json` | Team coordination state. |
| `.pi/<session-id>/team/<teamId>/tasks/<task-id>.json` | Task definitions and execution evidence. |
| `.pi/<session-id>/team/<teamId>/tasks/<task-id>/gates/review/attempt-<nn>.json` | Per-task review gate artifacts. |
| `.pi/<session-id>/team/<teamId>/events.jsonl` | Idempotent Team event log. |
| `.pi/<session-id>/team/<teamId>/receipts.jsonl` | Task execution receipt references. |
| `.pi/<session-id>/team/<teamId>/checkpoints/<run-id>.json` | Orchestrator checkpoint snapshots. |
| `.pi/<session-id>/team/<teamId>/runs/<run-id>.json` | Durable role-run records. |
| `.pi/<session-id>/team/<teamId>/gates/completion/attempt-<nn>.json` | Team completion gate artifacts. |
| `.pi/<session-id>/team/<teamId>/mailbox/<recipient>.jsonl` | Per-recipient coordination messages. |

## Gates

- Completed tasks must have a passing review gate.
- Completed teams must have a passing completion evidence gate.
- Transition validators fail closed when required state, session, or gate evidence is missing.
- Persisted Team records are parsed strictly; malformed or incomplete records are rejected rather than repaired with defaults.

## See Also

- [Workflow control plane](../../workflow.md)
- [Subagents and workflow tools](../../subagents/subagents.md)
