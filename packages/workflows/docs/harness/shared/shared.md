# Shared Workflow Utilities

Common utilities shared across workflow implementations.

**Source:** `src/harness/shared/`

## Overview

The shared module provides session layout, state I/O, audit logging, tamper detection, handoff helpers, expected-next role guards, compact-state projection, and skill transition registration used by deep-interview, ralplan, team, and ultragoal.

## Module Structure

| Module | Description |
|--------|-------------|
| `paths.ts` | Re-exports from `session-layout.ts` plus type aliases (`WorkflowSkill`, `RalplanStage`) |
| `session-layout.ts` | Session-scoped path builders; every workflow path requires a `sessionId` |
| `session-resolution.ts` | Session ID resolution and directory naming |
| `state-schema.ts` | Type assertions and validators for workflow state |
| `state-writer.ts` | Atomic state file writes with temp-file + rename |
| `active-state.ts` | Active workflow tracking |
| `audit-log.ts` | Append-only audit logging for workflow mutations |
| `receipts.ts` | Receipt tracking for mutation verification |
| `tamper-detection.ts` | Tamper detection for state files |
| `canonical-json.ts` | Deterministic JSON serialization for state hashing |
| `transaction-journal.ts` | Transaction journal for state mutations |
| `workflow-id.ts` | Workflow ID generation and parsing |
| `workflow-manifest.ts` | Workflow manifest and CLI verb metadata |
| `skill-registry.ts` | Per-skill transition tables, terminal detectors, gate validators, and next-role selectors |
| `expected-next-role.ts` | Guard helpers that reject off-sequence workflow-owned spawns and runtime overrides |
| `compact-state-registry.ts` | Shared compact-state projection registry |
| `workflow-tool-utils.ts` | Legacy-named helper module retained for shared command/runtime validation utilities |
| `handoff.ts` | Inter-skill handoff utilities |

## Canonical Route

Workflow state is mutated through `pi workflow ...` control-plane commands. Removed model-visible workflow tools such as `deep_interview_*`, `ralplan_*`, `team_*`, `ultragoal_*`, and `pi_workflow_state` are not registered.

## Session Layout

All session-aware path builders require a `sessionId`; there is no global fallback.

| Path | Description |
|------|-------------|
| `.pi/{sessionId}/state/` | Session state directory |
| `.pi/{sessionId}/workflows/{skill}/` | Workflow-specific state |
| `.pi/{sessionId}/team/{teamId}/` | Team coordination state |
| `.pi/{sessionId}/specs/` | Generated specs |
| `.pi/{sessionId}/plans/` | Generated plans |
| `.pi/{sessionId}/activity.json` | Session activity file |

## See Also

- [Deep Interview](../deep-interview/deep-interview.md) - Interview workflow
- [Ralplan](../ralplan/ralplan.md) - Planning workflow
- [Team](../team/team.md) - Team coordination workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Goal-tracking workflow
- [Subagents](../subagents/subagents.md) - Subagent control plane
