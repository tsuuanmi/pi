# Subagent Workflow Control Plane

Workflow subagents use one canonical route: **model-visible spawn tools** that call the main session's `SubagentManager` directly in-process. The old `pi workflow ...` spawn commands are removed. pi-agent owns the agent/subagent process; pi-workflows registers the spawn tools and owns turn order, guarded role checks, and result→artifact handoff.

**Source:** `src/harness/subagents/subagent-tools.ts`, `src/harness/ralplan/ralplan-tools.ts`, `src/harness/team/team-tools.ts`, `src/harness/ultragoal/ultragoal-tools.ts`, `src/extensions/workflows.ts`

## Canonical spawn tools

- `subagent_spawn` / `subagent_status` / `subagent_await` / `subagent_steer` / `subagent_pause` / `subagent_resume` / `subagent_cancel` — generic subagent control, calling the main session's `SubagentManager` directly.
- `ralplan_run_agent` — spawns a ralplan role agent (planner/architect/critic) as an ordinary subagent, writes the result as an artifact, and drives the next turn. Guarded: the workflow computes the legal next role and refuses off-script spawns or runtime model/tool overrides.
- `team_spawn_task_agent` — spawns a team worker as an ordinary subagent. Guarded: computes the legal next team task, refuses off-script task ids or overrides.
- `ultragoal_spawn_goal_agent` — spawns an ultragoal worker as an ordinary subagent. Guarded: computes the legal next goal, refuses off-script goal ids or overrides.

Subagent records persist under `.pi/<session-id>/state/subagents/` using the agent-layer record format.

## Why tools, not commands

A `pi workflow` CLI command is a short-lived separate process; it has no `SubagentManager` and cannot run an agent. Only the main interactive `AgentSession` holds a `SubagentManager` (the only place that can spawn and run a child agent to completion). So spawning must happen in-process in the main session, via a model-visible tool — exactly how any normal subagent is spawned. There is no socket hop and no isolated workflow runtime for spawning. The role agents are ordinary subagents; the workflow's special part is the turn order, the guarded role check, and writing the result as an artifact for the next agent.

## Guardrails

- Spawn tools are deterministic and fail closed on role mismatches (`assertExpectedNextRole`).
- Runtime `model`, `thinkingLevel`, `tools`, and `excludeTools` overrides are rejected on the guarded workflow spawn paths (`assertNoGuardedSpawnOverrides`).
- A `sessionId` is required on every `pi workflow ...` skill verb (deep-interview, ralplan, team, ultragoal) and on `pi workflow start`; no verb mints a session id. Spawn tools read the session id from `ctx.sessionManager.getSessionId()`, so it cannot be forgotten or mismatched.

## What stays as `pi workflow` commands

Non-spawn verbs remain commands (pure state file reads/writes, no agent process): `ralplan status/doctor/write-artifact/approve-plan/record-explorer-gate/read-compact`, `team start/snapshot/create-task/transition-task/send-message/record-review-gate/record-completion-gate/complete/read-compact`, `ultragoal create-plan/status/start-next/checkpoint/record-review-blockers/classify-blocker/guard/read-compact`, `deep-interview plan-question/record-answer/...`, plus the control plane (`start/observe/classify/recover/validate/finalize/operate/gc/events/retire`). The detached `RuntimeOwner` is lifecycle-only (no `SubagentManager`).

## Removed command verbs

`pi workflow subagents <spawn|status|await|steer|pause|resume|cancel>`, `pi workflow ralplan run-agent`, `pi workflow team spawn-task-agent`, and `pi workflow ultragoal spawn-goal-agent` are removed. Calling them errors with a message pointing to the corresponding model-visible tool.

## See Also

- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/subagents/subagents.md) - Pi-native SubagentManager
- [Team](../team/team.md) - Team workflow
- [Ultragoal](../ultragoal/ultragoal.md) - Ultragoal workflow