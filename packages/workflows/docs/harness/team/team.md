# Team Harness

Runtime workflow for the `team` skill.

**Source:** `src/skills/team/`

## Overview

Team manages the coordination board under `.pi/<session-id>/team/<team-id>/`. It tracks tasks, worker messages, review gates, completion evidence, and guarded worker/reviewer/prover spawns.

## Module Structure

| Module | Description |
|--------|-------------|
| `team-compact.ts` | Prompt-efficient compact state projection. |
| `team-hud.ts` | HUD chip rendering for team status. |
| `team-runtime.ts` | State I/O, task transitions, messages, gates, completion, and snapshot/read-compact operations. |
| `team-tools.ts` | Registers `team_spawn_task_agent`, `team_spawn_review_agent`, and `team_spawn_prover_agent`. |
| `team-transitions.ts` | Skill transition table, expected-next worker selection, fail-closed gate validators. |

## Canonical Route

Use `pi workflow team <action>` for non-spawn operations:

- `start`
- `snapshot`
- `read-compact`
- `create-task`
- `transition-task`
- `send-message`
- `record-review-gate`
- `record-completion-gate`
- `complete`

Use `team_spawn_task_agent` for worker execution, `team_spawn_review_agent` for task review gates, and `team_spawn_prover_agent` for the completion evidence gate. These tools are state guarded: the harness computes the legal next team role from team state and refuses off-sequence spawns or runtime model/tool overrides.

## State Files

| File | Description |
|------|-------------|
| `.pi/<session-id>/team/<teamId>/config.json` | Team coordination state. |
| `.pi/<session-id>/team/<teamId>/tasks/` | Task definitions and evidence. |
| `.pi/<session-id>/team/<teamId>/events.jsonl` | Event log. |
| `.pi/<session-id>/team/<teamId>/mailbox/<recipient>.jsonl` | Per-recipient messages. |

## Gates

- Completed tasks must have a passing review gate.
- Completed teams must have a passing completion evidence gate.
- Transition validators fail closed when required state, session, or gate evidence is missing.

## See Also

- [Team skill](../../skills/team/team.md)
- [Subagents](../subagents/subagents.md)
- [Shared utilities](../shared/shared.md)
