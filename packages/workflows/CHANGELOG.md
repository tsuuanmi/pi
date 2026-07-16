## [Unreleased]

### Added

- **team**: Added prover and reviewer gates for team workflows, including `team_record_completion_gate`, `team_record_review_gate`, fail-closed `evidence_matrix` / `review_report` validation, bounded retry escalation, and deterministic gate artifact storage.
- **ralplan**: Added an explorer pre-planner gate with `ralplan_record_explorer_gate`, fail-closed `context_map` validation, bounded retry escalation, and shared deterministic context-template builders for ralplan role prompts and tasks.
- **workflows**: Added scoped expected-next role helpers for guarded workflow spawns, rejecting off-script role mismatches and runtime model/tool overrides in workflow-owned spawn paths.
- **workflows**: Added state-driven `expectedNextRalplanRole`/`expectedNextTeamRole` selectors that compute the one legal next spawn from workflow state (ralplan artifact index + critic verdict branching; team lexicographic task selection). `ralplan_run_agent` and `team_spawn_task_agent` now refuse spawns that do not match the state-computed legal next role. The ralplan selector also models the explorer pre-planner gate, returning `{ stage: "pre-planner", role: "explorer" }` until a passing `context_map` is recorded, so planner spawns are deterministically refused at the selector seam rather than only inside the role-agent runner.
- **workflows**: Added carried handoff contract fields for obstacles, deterministic final-package receipt assembly, shared HUD chip helpers, and a shared stage artifact writer.
- **ralplan**: Added expert-stage escalation with an `expert-strategist` role after iterate-cap or explorer-gate `human_blocked` escalation.

### Fixed

- **ralplan**: The explorer pre-planner gate no longer writes state with `force`; it goes through the normal manifest transition/tamper gate like the released ralplan artifact path, avoiding spurious `force_overwrite` audit entries.
- **team**: Prover `evidence_matrix` and reviewer `review_report` blocking artifacts now escalate to `human_blocked` on the second blocking attempt, matching the bounded-retry contract (previously only the missing-artifact path escalated).

### Changed

- **ralplan**: `ralplan_approve_plan` now refuses to approve a plan whose latest critic verdict is REJECT; set `overrideCriticVerdict: true` to force approval. A latest critic verdict of ITERATE produces a soft warning instead of blocking, and the approval result now carries `critic_verdict`, `critic_verdict_overridden`, and `approval_warning`. `ralplan_doctor` warns when a pending plan's latest critic verdict is REJECT or ITERATE. This enforces the documented workflow intent that a final plan should not be approved over a critic REJECT.
- **workflows**: Fail-soft handoff/obstacle ingest failures now record a durable `fail_soft_error` audit entry and surface `fail_soft_errors` on the ralplan approve receipt, instead of only logging to stderr. A new `handoff-no-ingest-handler` fail-soft site surfaces carried obstacles that have no ingest handler for the callee skill (e.g. team).

### Removed

- **workflows**: Removed the write-only `carried_decisions` handoff field and `HandoffCarriedDecision` type (reverts an unreleased addition; no consumer read them).
- **workflows**: Removed the unused `estimateCompactBytes` and `truncateLastN` compact-budget helpers (only referenced by their own tests; kept `CompactBudget`/`lastN`).
- **workflows**: Removed the workflow tool-pruning feature: the `workflows.pruneInactiveTools` extension flag, the `applyWorkflowToolPruning` session/before-start handler logic in the workflows extension, and the `harness/shared/tool-groups.ts` pruning helpers (`selectWorkflowActiveTools`, `resolveActiveWorkflowSkills`, `sameToolSet`, `WORKFLOW_OWNED_TOOLS`, `WORKFLOW_SKILL_TOOLS`, and the per-skill tool arrays). Workflow-owned tools (`deep-interview_*`, `ralplan_*`, `team_*`, `ultragoal_*`) are now always model-visible, so workflows can be started and resumed without "tool not found" errors. The unrelated `pi workflow gc --prune` session-directory GC is unaffected.