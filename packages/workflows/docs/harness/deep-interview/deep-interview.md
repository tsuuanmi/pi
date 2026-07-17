# Deep Interview Workflow

Runtime workflow for the deep-interview skill.

**Source:** `src/harness/deep-interview/`

## Overview

The deep-interview workflow manages the interview state machine, persisting progress under the current session root at `.pi/<session-id>/workflows/deep-interview/`. It coordinates question planning, answer recording, scoring, and spec writing.

## Module Structure

| Module | Description |
|--------|-------------|
| `deep-interview-state.ts` | State types, transitions, and persistence |
| `deep-interview-runtime.ts` | Main runtime loop and phase coordination |
| `deep-interview-tools.ts` | Tool definitions for interview phases |
| `deep-interview-mutation-guard.ts` | State mutation validation |
| `deep-interview-hud.ts` | HUD (heads-up display) rendering for interactive mode |

## State Machine

The deep-interview workflow follows these phases:

| Phase | Description |
|-------|-------------|
| `planning` | Generate questions based on initial prompt and domain |
| `interviewing` | Present questions, collect and score answers |
| `scoring` | Evaluate ambiguity and completeness scores |
| `spec_writing` | Generate final specification from interview results |
| `complete` | Interview is finished, spec is written |

### State Files

| File | Description |
|------|-------------|
| `.pi/<sessionId>/workflows/deep-interview/state.json` | Current interview state |
| `.pi/<sessionId>/specs/deep-interview-index.jsonl` | Append-only spec index |
| `.pi/<sessionId>/specs/deep-interview-<slug>.md` | Final spec output |

### InterviewState

```typescript
interface InterviewState {
  phase: InterviewPhase;
  topic: string;
  questions: InterviewQuestion[];
  currentQuestionIndex: number;
  scores: AmbiguityScore[];
  spec?: string;
  startedAt: string;
  updatedAt: string;
}

interface InterviewQuestion {
  id: string;
  question: string;
  category: string;
  answer?: string;
  score?: number;
  notes?: string;
}

interface AmbiguityScore {
  dimension: string;
  score: number;    // 0-1
  reason: string;
}
```

## Tools

The deep-interview workflow exposes tools for each phase:

- `deep_interview_start` — Begin a new interview for a topic
- `deep_interview_answer` — Submit an answer to the current question
- `deep_interview_score` — Score an answer for ambiguity
- `deep_interview_next` — Move to the next question
- `deep_interview_complete` — Finish interview and write spec

## Mutation Guard

State mutations are validated by `deep-interview-mutation-guard.ts` to ensure:
- Phase transitions are valid (e.g., can't jump from `planning` directly to `complete`)
- Required fields are present for each phase transition
- The interview hasn't already been completed

## HUD

The HUD renders interview progress in the TUI, showing:
- Current phase and question number
- Ambiguity scores
- Progress indicators

## See Also

- [Deep Interview Skill](../../skills/deep-interview/deep-interview.md) - Skill definition and SKILL.md
- [Shared Utilities](../shared/shared.md) - Common workflow utilities