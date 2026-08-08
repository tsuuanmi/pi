# Deep Interview Skill

Socratic requirements interview with ambiguity scoring before planning or execution.

**Source:** `src/skills/deep-interview/`

## Usage

```bash
/skill:deep-interview [--quick|--standard|--deep] <idea>
```

## Overview

Deep Interview manages Socratic requirements discovery, ambiguity scoring, closure checks, mutation guards, and final spec writing under `.pi/<session-id>/workflows/deep-interview/`.

## Module Structure

| Module | Description |
|--------|-------------|
| `guards.ts` | Validates legal Deep Interview handoff targets. |
| `help.ts` | Command action descriptions, typed arguments, and help metadata. |
| `hud.ts` | HUD chip rendering for interview progress. |
| `mutation-guard.ts` | Blocks product-code mutation while an unfinished interview is active. |
| `runtime.ts` | Question planning, answer/scoring merges, closure, restatement, and spec finalization. |
| `state.ts` | State types, transitions, persistence, and compact projection. |
| `surface.ts` | Validated command and model-visible tool surface metadata. |
| `tools.ts` | Registers the `deep_interview_*` model-visible tools (`plan-question`, `record-answer`, `record-scoring`, `read-compact`, `closure-check`, `restate-goal`, `write-spec`). |
| `transitions.ts` | Skill transition table. |

## Runtime Route

- External callers read/write envelope state through `pi workflow state deep-interview ...` with the current `sessionId`.
- External callers use `pi workflow deep-interview <plan-question|record-answer|record-scoring|read-compact|closure-check|restate-goal|write-spec>` for the CLI action contract.
- During an interactive Pi session, the model uses the corresponding `deep_interview_*` tools. Those tools call the workflow runtime in-process; they do not invoke the CLI commands.
- The command actions and model-visible tools may share lower-level runtime functions, but neither adapter calls the other.
- Use read-only subagents only when the skill instructions call for research or lateral review.
- Direct `edit`/`write` mutations are blocked while an unfinished interview is active.

Use `pi workflow state deep-interview <read|write|clear|handoff|active|doctor>` only for envelope-level workflow state.

## Workflow

1. Emit the threshold marker and initialize state.
2. Classify greenfield/brownfield context.
3. Enumerate top-level components before deep questioning.
4. Ask one question per round and record the answer.
5. Score ambiguity and contradictions after each answer.
6. Run closure and goal restatement checks when ambiguity is below threshold.
7. Persist a final spec to `.pi/<session-id>/specs/`.
8. Offer handoff to Ralplan, Ultragoal, Team, refine, or stop.

## Model-Visible Tools

`tools.ts` registers the workflow-owned interview tools that the model calls during an active interview:

| Tool | Purpose |
|------|---------|
| `deep_interview_plan_question` | Plan the next question and mark the workflow as waiting for an answer. |
| `deep_interview_record_answer` | Record or replace an answer shell, including optional topology lock. |
| `deep_interview_record_scoring` | Record scores, ambiguity, trigger metadata, and advisory counters for a round. |
| `deep_interview_read_compact` | Read a compact state projection for resume or prompt budgeting. |
| `deep_interview_closure_check` | Run the closure and acceptance guard. |
| `deep_interview_restate_goal` | Record the one-sentence restated goal confirmation or adjustment. |
| `deep_interview_write_spec` | Persist a finalized spec and optionally hand off to ralplan, ultragoal, or team. |

These tools are registered by bundled workflow registration and run in-process against the current session.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/deep-interview/state.json` | Current interview state. |
| `.pi/<sessionId>/specs/deep-interview-index.jsonl` | Append-only spec index. |
| `.pi/<sessionId>/specs/deep-interview-<slug>.md` | Final spec output. |

## Mutation Guard

The bundled workflow registration calls `getDeepInterviewMutationDecision` before `edit`, `write`, and mutating `bash` tool execution. If a non-finished Deep Interview workflow is active, direct product-code edits are blocked; sanctioned workflow state/artifact writes must go through a workflow-owned runtime adapter: the CLI command layer for command calls or the `deep_interview_*` tools for in-session calls.

## See Also

- [Workflow control plane](../../workflow.md)
- [Subagents and workflow tools](../../subagents/subagents.md)
- [Shared utilities](../../state/state.md)
