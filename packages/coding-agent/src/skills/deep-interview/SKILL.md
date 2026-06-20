---
name: deep-interview
description: Socratic requirements interview with ambiguity scoring before planning or execution. Use for vague, complex, or high-risk requests where assumptions must be exposed before work starts.
argument-hint: "[--quick|--standard|--deep] <idea>"
---

# Deep Interview

Deep Interview turns a vague idea into a concrete specification before any mutation starts.

## Boundaries

- This is a planning skill. Do not edit source files, run mutation-oriented commands, commit, push, or invoke execution skills until the user explicitly approves execution.
- Persist workflow artifacts only through Pi workflow tools. Do not directly edit `.pi/workflows`, `.pi/specs`, or `.pi/plans` with `write` or `edit` unless the user explicitly asks for manual recovery.
- Ask one question at a time.
- Prefer answering factual brownfield questions from repository evidence. Ask the user for decisions, tradeoffs, priorities, and scope.

## Workflow

1. Read active state with `pi_workflow_state` for `skill: "deep-interview"`. If no state exists, initialize it with `pi_workflow_state` `action: write`:
   - `active: true`, `phase: "interviewing"`
   - `data.mode`: one of `quick`, `standard`, or `deep`. Parse `--quick`/`--standard`/`--deep` flags from arguments; default to `standard`. The mode is only a depth hint; it does not change the threshold.
   - `data.threshold`: `0.05` (5%) and `data.threshold_source`: `"default"`.
   - `data.resolution`: same as mode.
   - `data.state`: `{ initial_idea: "<the user's idea text, stripping flags>", rounds: [], established_facts: [], current_ambiguity: 1, threshold: 0.05, threshold_source: "default", orchestration: { status: "interviewing", question_plan: [] } }`
2. Resolve or confirm the interview mode. The mode (`quick`/`standard`/`deep`, default `standard`) signals intended depth only; the ambiguity threshold is always `0.05` (5%).
3. Classify the request as greenfield or brownfield. For brownfield, inspect relevant files first.
4. Ask a Round 0 topology question before scoring: list 1–6 top-level components/outcomes and ask whether to add, remove, merge, split, or defer any.
5. Repeat until ambiguity is at or below threshold, the user exits early, or the interview reaches a practical stopping point:
   - Identify the weakest component/dimension.
   - Plan the next targeted Socratic question with `deep_interview_plan_question`, then ask exactly that one question.
   - Score clarity from 0.0 to 1.0 across goal, constraints, success criteria, and context when brownfield.
   - Compute ambiguity:
     - greenfield: `1 - (goal * 0.40 + constraints * 0.30 + criteria * 0.30)`
     - brownfield: `1 - (goal * 0.35 + constraints * 0.25 + criteria * 0.25 + context * 0.15)`
   - Report the new ambiguity and the next weakest gap.
   - Record the answer shell with `deep_interview_record_answer` after each answer; when a planned question is pending, omit repeated question metadata unless it changed.
   - Record scores and trigger metadata with `deep_interview_record_scoring`; if the tool rejects a transition, treat the scoring as invalid and correct it rather than editing state directly.
   - Use `deep_interview_read_compact` when resuming or when the transcript is too large for prompt-efficient continuation.
6. Before writing the spec, restate the goal in one sentence and ask the user to confirm it.
7. Write the final spec with `deep_interview_write_spec`.
8. Ask the user what to do next:
   - Refine with `/skill:ralplan <spec path>` (recommended for non-trivial work)
   - Execute with `/skill:ultragoal <spec path>` only when the spec is already simple and implementation-ready
   - Coordinate with `/skill:team <spec path>` only when parallel workers are explicitly useful
   - Stop

## Final Spec Shape

Include:

- title and metadata
- final ambiguity score and threshold
- topology with active and deferred components
- established facts
- goal
- constraints and non-goals
- acceptance criteria
- assumptions exposed and resolved
- technical context
- transcript summary
- recommended next step
