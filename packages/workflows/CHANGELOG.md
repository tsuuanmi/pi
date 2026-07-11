## [Unreleased]

### Added

- **team**: Added prover and reviewer gates for team workflows, including `team_record_completion_gate`, `team_record_review_gate`, fail-closed `evidence_matrix` / `review_report` validation, bounded retry escalation, and deterministic gate artifact storage.
- **ralplan**: Added an explorer pre-planner gate with `ralplan_record_explorer_gate`, fail-closed `context_map` validation, bounded retry escalation, and shared deterministic context-template builders for ralplan role prompts and tasks.
- **workflows**: Added scoped expected-next role helpers for guarded workflow spawns, rejecting off-script role mismatches and runtime model/tool overrides in workflow-owned spawn paths.
- **workflows**: Added state-driven `expectedNextRalplanRole`/`expectedNextTeamRole` selectors that compute the one legal next spawn from workflow state (ralplan artifact index + critic verdict branching; team lexicographic task selection). `ralplan_run_agent` and `team_spawn_task_agent` now refuse spawns that do not match the state-computed legal next role. The ralplan selector also models the explorer pre-planner gate, returning `{ stage: "pre-planner", role: "explorer" }` until a passing `context_map` is recorded, so planner spawns are deterministically refused at the selector seam rather than only inside the role-agent runner.
- **workflows**: Added carried handoff contract fields for obstacles/decisions, deterministic final-package receipt assembly, shared HUD chip helpers, and a shared stage artifact writer.
- **ralplan**: Added expert-stage escalation with an `expert-strategist` role after iterate-cap or explorer-gate `human_blocked` escalation.

### Fixed

- **workflows**: Workflow-skill tools (deep-interview/ralplan/team/ultragoal) now stay available while their workflow is in play, instead of being pruned to a single "most-recent non-stale" group. Tool availability is now the union of any skill invoked this turn (via `/skill:`) and every skill with an active (non-cleared) workflow entry. This fixes "tool not found" errors when resuming a workflow that went idle past the 30-minute freshness window (staleness is now a HUD concern, not a tool-availability concern) and when multiple workflows are active concurrently. Inactive entries (e.g. a skill that handed off) are still excluded.
- **ralplan**: The explorer pre-planner gate no longer writes state with `force`; it goes through the normal manifest transition/tamper gate like the released ralplan artifact path, avoiding spurious `force_overwrite` audit entries.
- **team**: Prover `evidence_matrix` and reviewer `review_report` blocking artifacts now escalate to `human_blocked` on the second blocking attempt, matching the bounded-retry contract (previously only the missing-artifact path escalated).

### Changed

- **ralplan**: `ralplan_approve_plan` now refuses to approve a plan whose latest critic verdict is REJECT; set `overrideCriticVerdict: true` to force approval. A latest critic verdict of ITERATE produces a soft warning instead of blocking, and the approval result now carries `critic_verdict`, `critic_verdict_overridden`, and `approval_warning`. `ralplan_doctor` warns when a pending plan's latest critic verdict is REJECT or ITERATE. This enforces the documented workflow intent that a final plan should not be approved over a critic REJECT.
- **workflows**: Tool pruning now targets only the four workflow-skill toolsets (deep-interview/ralplan/team/ultragoal). `pi_workflow_state`, subagent tools, and harness tools (`fetch`/`yield`) are always available, so workflows can be started and subagents can be used with no active workflow. The `workflows.pruneInactiveTools` flag default is restored to `true` (prune inactive skill toolsets when no workflow is active); the earlier `false` default is no longer needed because cross-cutting tools are no longer pruned.