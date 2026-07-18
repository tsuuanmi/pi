# Team Workflow

Runtime workflow for the team skill.

**Source:** `src/harness/team/`

## Overview

The team workflow manages the team coordination board, persisting state to `.pi/<session-id>/team/<team-id>/`. It tracks tasks, worker messages, review gates, and completion evidence.

## Module Structure

| Module | Description |
|--------|-------------|
| `team-runtime.ts` | State I/O, task transitions, review/completion gate recording, compact projection |
| `team-transitions.ts` | Skill transition table, expected-next worker selection, fail-closed gate validators |
| `team-hud.ts` | HUD rendering for team status |
| `team-compact.ts` | Prompt-efficient compact state projection |

## Canonical Route

Use the `pi workflow team <action>` control plane. The removed `team_*` model-visible tools are not registered.

Supported actions include:

- `start`
- `snapshot`
- `read-compact`
- `create-task`
- `transition-task`
- `send-message`
- `record-review-gate`
- `record-completion-gate`
- `complete`
- `spawn-task-agent`

`spawn-task-agent` is state guarded: it computes the legal next task from team state and refuses off-sequence spawns or runtime model/tool overrides.

## State Files

| File | Description |
|------|-------------|
| `.pi/<session-id>/team/<teamId>/config.json` | Team coordination state |
| `.pi/<session-id>/team/<teamId>/tasks/` | Task definitions and evidence |
| `.pi/<session-id>/team/<teamId>/events.jsonl` | Event log |
| `.pi/<session-id>/team/<teamId>/mailbox/<recipient>.jsonl` | Per-recipient messages |

## Gates

- Completed tasks must have a passing review gate.
- Completed teams must have a passing completion evidence gate.
- Transition validators fail closed when required state, session, or gate evidence is missing.

## See Also

- [Subagents](../subagents/subagents.md) - Workflow subagent control plane
- [Shared Utilities](../shared/shared.md) - Common workflow utilities
