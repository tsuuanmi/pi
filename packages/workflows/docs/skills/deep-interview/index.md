# Deep Interview Skill

Socratic requirements interview with ambiguity scoring before planning or execution.

**Source:** `src/skills/deep-interview/`

## Usage

```bash
/skill:deep-interview [--quick|--standard|--deep] <idea>
```

## Overview

Deep Interview manages Socratic requirements discovery, ambiguity scoring, closure checks, mutation guards, and final spec writing under `.pi/<session-id>/skills/deep-interview/`.

## Module Structure

| Module | Description |
|--------|-------------|
| `closure.ts` | Closure coverage, acceptance, and restated-goal gates. |
| `envelope.ts` | Strict canonical envelope parsing and deterministic state merges. |
| `guards.ts` | Validates legal Deep Interview handoff targets. |
| `help.ts` | Command action descriptions, typed arguments, and help metadata. |
| `hud.ts` | HUD rendering from canonical nested state. |
| `identity.ts` | Question, answer, and round identity hashes. |
| `mutation-guard.ts` | Applies active-interview and workflow-state mutation policy. |
| `mutation-paths.ts` | Resolves mutation paths and permits only neutral temporary targets. |
| `mutation-targets.ts` | Extracts targets from edit, write, and shell inputs. |
| `questions.ts` | Question planning and waiting-state transitions. |
| `rounds.ts` | Answer-shell persistence and scored-round transitions. |
| `schemas.ts` | Strict model-visible tool schemas and inferred adapter input types. |
| `spec.ts` | Spec readiness and finalized-state persistence. |
| `deep-interview-store.ts` | Session-scoped state persistence and active-state synchronization. |
| `transitions.ts` | Obstacle-aware scored-transition validation. |
| `types.ts` | Canonical domain and operation contracts. |
| `surface.ts` | Validated command and model-visible tool surface metadata. |
| `tools.ts` | Registers the `deep_interview_*` model-visible tools (`plan-question`, `record-answer`, `record-scoring`, `closure-check`, `restate-goal`, `write-spec`). |
| `policy.ts` | Immutable skill policy. |

## Runtime Route

- External callers read, initialize, replace, clear, hand off, or diagnose envelope state through `pi workflow state deep-interview ...` with the current `sessionId`; round mutations use Deep Interview actions.
- External callers use `pi workflow deep-interview <plan-question|record-answer|record-scoring|closure-check|restate-goal|write-spec>` for the CLI action contract.
- During an interactive Pi session, the model uses the corresponding `deep_interview_*` tools. Those tools call the workflow runtime in-process; they do not invoke the CLI commands.
- The command actions and model-visible tools may share lower-level runtime functions, but neither adapter calls the other.
- Use read-only subagents only when the skill instructions call for research or lateral review.
- Direct `edit`/`write` mutations are blocked while an unfinished interview is active.

Persisted state uses one canonical nested `state` object. Flattened transcript fields, malformed arrays, unplanned answers, missing answer shells during scoring, and inferred project classification are rejected rather than repaired. Confirmed topology records require explicit component descriptions, evidence, statuses, and deferrals. Question planning requires an explicit bottleneck rationale, and planning, answer recording, and scoring require the same explicit question identity. Spec writes require an explicit slug and handoff; Ralplan handoffs also require an explicit run ID.

## Workflow

1. Emit the threshold marker and initialize state.
2. Classify greenfield/brownfield context; stop if repository exploration cannot establish the classification.
3. Enumerate top-level components before deep questioning.
4. Ask one question per round and record the answer.
5. Score ambiguity and contradictions after each answer.
6. Run closure and goal restatement checks when ambiguity is below threshold.
7. Persist a final spec to `.pi/<session-id>/artifacts/specs/`.
8. Offer handoff to Ralplan, Ultragoal, Team, refine, or stop.

## Model-Visible Tools

`tools.ts` registers the workflow-owned interview tools that the model calls during an active interview:

| Tool | Purpose |
|------|---------|
| `deep_interview_plan_question` | Plan the next question and mark the workflow as waiting for an answer. |
| `deep_interview_record_answer` | Record or replace an answer shell, including optional topology lock. |
| `deep_interview_record_scoring` | Record scores, ambiguity, trigger metadata, and advisory counters for a round. |
| `deep_interview_closure_check` | Run the closure and acceptance guard. |
| `deep_interview_restate_goal` | Record the one-sentence restated goal confirmation or adjustment. |
| `deep_interview_write_spec` | Persist a finalized spec with an explicit handoff target and Ralplan run identity when applicable. |

These tools are registered by bundled workflow registration and run in-process against the current session.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/skills/deep-interview/state.json` | Current interview state. |
| `.pi/<sessionId>/artifacts/specs/deep-interview-index.jsonl` | Append-only spec index. |
| `.pi/<sessionId>/artifacts/specs/deep-interview-<slug>.md` | Final spec output. |

## Mutation Guard

The bundled workflow registration calls `getDeepInterviewMutationDecision` before `edit`, `write`, and mutating `bash` tool execution. If a non-finished Deep Interview workflow is active, direct product-code edits are blocked; sanctioned workflow state/artifact writes must go through a workflow-owned runtime adapter: the CLI command layer for command calls or the `deep_interview_*` tools for in-session calls.

## See Also

- [Workflow control plane](../../workflow.md)
- [Subagent and workflow tools](../../subagent/subagent.md)
- [Shared utilities](../../state/state.md)
