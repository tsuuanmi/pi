# Deep Interview Skill

Socratic requirements interview with ambiguity scoring before planning or execution.

**Source:** `src/skills/deep-interview/SKILL.md`

## Usage

```bash
/skill:deep-interview [--quick|--standard|--deep] <idea>
```

## Runtime Route

- Read/write envelope state through `pi workflow state deep-interview ...` with the current `sessionId`.
- Drive interview state through `pi workflow deep-interview <plan-question|record-answer|record-scoring|read-compact|closure-check|restate-goal|write-spec>`.
- Use read-only subagents only when the skill instructions call for research or lateral review.
- Direct `edit`/`write` mutations are blocked while an unfinished interview is active.

## Workflow

1. Emit the threshold marker and initialize state.
2. Classify greenfield/brownfield context.
3. Enumerate top-level components before deep questioning.
4. Ask one question per round and record the answer.
5. Score ambiguity and contradictions after each answer.
6. Run closure and goal restatement checks when ambiguity is below threshold.
7. Persist a final spec to `.pi/<session-id>/specs/`.
8. Offer handoff to Ralplan, Ultragoal, Team, refine, or stop.

## See Also

- [Workflow control plane](../../workflow.md)
- [Deep Interview harness](../../harness/deep-interview/deep-interview.md)
