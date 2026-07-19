# Deep Interview Harness

Runtime workflow for the `deep-interview` skill.

**Source:** `src/skills/deep-interview/`

## Overview

Deep Interview manages Socratic requirements discovery, ambiguity scoring, closure checks, mutation guards, and final spec writing under `.pi/<session-id>/workflows/deep-interview/`.

## Module Structure

| Module | Description |
|--------|-------------|
| `deep-interview-hud.ts` | HUD chip rendering for interview progress. |
| `deep-interview-mutation-guard.ts` | Blocks product-code mutation while an unfinished interview is active. |
| `deep-interview-runtime.ts` | Question planning, answer/scoring merges, closure, restatement, and spec finalization. |
| `deep-interview-state.ts` | State types, transitions, and persistence. |
| `deep-interview-transitions.ts` | Skill transition table. |

## Canonical Route

Use `pi workflow deep-interview <action>` for runtime state and artifacts:

- `plan-question`
- `record-answer`
- `record-scoring`
- `read-compact`
- `closure-check`
- `restate-goal`
- `write-spec`

Use `pi workflow state deep-interview <read|write|clear|handoff|active|doctor>` only for envelope-level workflow state.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/deep-interview/state.json` | Current interview state. |
| `.pi/<sessionId>/specs/deep-interview-index.jsonl` | Append-only spec index. |
| `.pi/<sessionId>/specs/deep-interview-<slug>.md` | Final spec output. |

## Mutation Guard

The extension calls `getDeepInterviewMutationDecision` before `edit` and `write` tool execution. If a non-finished Deep Interview workflow is active, direct product-code edits are blocked; sanctioned workflow state/artifact writes must go through the command layer.

## See Also

- [Deep Interview skill](../../skills/deep-interview/deep-interview.md)
- [Shared utilities](../shared/shared.md)
