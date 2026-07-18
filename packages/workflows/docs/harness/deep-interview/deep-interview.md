# Deep Interview Workflow

Runtime workflow for the deep-interview skill.

**Source:** `src/harness/deep-interview/`

## Overview

The deep-interview workflow manages Socratic requirements discovery, ambiguity scoring, closure checks, and final spec writing under `.pi/<session-id>/workflows/deep-interview/`.

## Module Structure

| Module | Description |
|--------|-------------|
| `deep-interview-state.ts` | State types, transitions, and persistence |
| `deep-interview-runtime.ts` | Question planning, answer/scoring merges, closure and spec finalization |
| `deep-interview-transitions.ts` | Skill transition table |
| `deep-interview-mutation-guard.ts` | Phase-boundary mutation guard |
| `deep-interview-hud.ts` | HUD rendering for interview progress |

## Canonical Route

Use the `pi workflow deep-interview <action>` control plane. The removed `deep_interview_*` model-visible tools are not registered.

Supported actions include:

- `plan-question`
- `record-answer`
- `record-scoring`
- `read-compact`
- `closure-check`
- `restate-goal`
- `write-spec`

Use `pi workflow state deep-interview <read|write|clear>` only for envelope-level workflow state. Runtime actions above perform safe state-level merges and should be preferred during normal interviews.

## State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/deep-interview/state.json` | Current interview state |
| `.pi/<sessionId>/specs/deep-interview-index.jsonl` | Append-only spec index |
| `.pi/<sessionId>/specs/deep-interview-<slug>.md` | Final spec output |

## Mutation Guard

The mutation guard blocks direct product-code edits while a non-finished deep-interview workflow is active, except for sanctioned workflow state/artifact writes through the control plane.

## See Also

- [Shared Utilities](../shared/shared.md) - Common workflow utilities
