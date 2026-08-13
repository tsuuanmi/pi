## [Unreleased]

### Breaking Changes

- **agent execution**: Removed `ralplan_run_agent` and `ultragoal_spawn_goal_agent`; Ralplan and Ultragoal now select profiles, prompts, metadata, and workflow artifacts around orchestrator-owned `subagent_spawn`.
- **events**: Renamed the workflow Team queue projection to `TeamWorkflowEvent`, `mapTaskQueueEvent`, and `saveTeamWorkflowEvents`; removed the ambiguous old names and unused `TeamEventSink` wrapper.
- **team**: Team Orchestrator runs now enforce strict checkpoint persistence, replace the generic Orchestrator options bag with a direct `signal`, and reject caller-controlled execution policies.
- **receipts**: Renamed generic workflow runtime receipt APIs to `WorkflowRuntimeReceipt`, `readWorkflowRuntimeReceipts`, `appendWorkflowRuntimeReceipt`, and `isWorkflowRuntimeReceiptValid`; replaced the misnamed workflow receipt helper with `WorkflowToolDetails`/`workflowToolDetails`; removed the mutable receipt-family rule registry, and stopped inferring final-package sections from legacy aliases.
- **ultragoal**: Replaced `record-review-blockers` with the typed `record-obstacle` action and removed the legacy review-blocker writer/event path.
- **packaging**: Pi resources now resolve exclusively from the compiled `dist` tree; source-path package metadata and host-side manifest rewriting were removed.
- **policy**: Removed mutable, side-effect-registered transition tables; workflow policies are immutable and loaded explicitly.
- **runtime**: Removed fallback-harness execution, `seams.ts`, and the `fallback-harness-exec` recovery classification. Owner-bound operations (validate, finalize, operate, retire) now require a live owner instead of executing locally. Recovery acquires a lease and never falls back to synthetic writer state.
- **state**: Removed generic `state write` and `state handoff` commands; workflow mutations belong to skill actions. Removed `force`/`force-repair` bypass paths from state writes, transition validation, and tamper detection. Out-of-band edits now hard-block without a force override.
- **session**: Removed `session-resolution.ts` and `PI_SESSION_ID` environment fallback; session identity comes only from `--session` (CLI), `sessionId` (payload), or host context.
- **exports**: Removed the `@tsuuanmi/pi-workflows/session/root` export; shared `.pi` root and session path primitives now come from `@tsuuanmi/pi/session/root`.
- **ralplan**: Approval requires an APPROVE verdict from the latest critic pass; `overrideCriticVerdict` was removed. Obstacle-ledger agreement is always enforced, writes validate persisted records, and malformed ledgers fail closed.
- **ultragoal**: Removed `replayExempt` and `fallbackArtifactRefs` from the quality gate; all artifact proofs must resolve to live evidence.
- **deep-interview**: Removed `allowEarlyExit` from spec finalization; above-threshold ambiguity always blocks.
- **deep-interview**: Removed generated identities, optional handoff defaults, inferred project classification, and permissive topology records; question identity, confirmed topology, spec slugs, handoff targets, and Ralplan run IDs are now explicit, and malformed persisted interview state fails closed.
- **state-projections**: Removed workflow state projection APIs, their dedicated CLI actions, and the Deep Interview projection tool; use the regular state, status, and snapshot operations instead.
- **registry**: Removed compatibility transition metadata, wildcard source-state matching, and legacy Ralplan phases; workflow state transitions now use explicit canonical states only.
- **state**: Active-state persistence is now version 2 with mandatory session ownership; unsupported versions, global, malformed, and foreign-session entries are rejected without migration.
- **handoff**: Transaction journals are version 2 and use one top-level session identity; per-side session compatibility fields were removed.
- **commands**: Removed the `@tsuuanmi/pi-workflows/commands/state-command` compatibility export; use `commands/workflow`.
- **quality-gate**: CLI validation now accepts Node commands only; alternate-runtime command support and the deprecated `validateExecutorQaEvidence` alias were removed.
- **exports**: Removed the mixed `runtime/operations`, `skills/ultragoal/runtime`, and `skills/ultragoal/quality-gate` modules and the unrestricted `./runtime/*` package subpath. Runtime recovery, policy, validation, finalization, workspace markers, Ultragoal plans, checkpoints, obstacles, and quality-gate validation now have responsibility-owned modules.
- **exports**: Replaced the mixed workflow tool surface with `@tsuuanmi/pi-workflows/tool`; workflow specs now adapt to the core `Tool` contract.
- **session**: Removed implicit latest-session discovery and activity-marker writes; every workflow operation now requires an explicit session source.
- **subagent**: Removed workflow-owned subagent contracts and thinking-level exports; lifecycle behavior now comes from explicit providers through the workflow tool adapter.
- **subagent**: Workflow tools consume the complete session-aware subagent API from `@tsuuanmi/pi-orchestrator`; workflows do not define a parallel contract or manager.

### Added

- **extension**: Workflow extensions now register active workflow HUD data through Pi's generic `registerHudProvider` feature.
- **extensions**: Added `@tsuuanmi/pi-workflows/hooks` with the focused `registerWorkflowHooks()` registrar alongside `registerWorkflowTools()`.
- **team**: Replaced direct team subagent spawning with explicit `team_execute` and `team_resume` orchestrator operations; role-task batching, fresh/resume checkpoint control, separate execution state, workflow-owned persistence, and no fallback execution path are enforced.

### Changed

- **workflow boundary**: Moved guarded single-agent admission and Ralplan terminal artifact validation into focused workflow execution-policy modules while leaving generic lifecycle and output transport in orchestrator.
- **extension**: The bundled extension installs Orchestrator's subagent runtime and adapts Pi's generic extension context into workflow tool context.
- **subagent**: Moved the generic subagent-to-Agent stream adapter and its tests to Orchestrator; workflow adapters consume the public export.
- **ralplan**: Approved plans now map to Team or Ultragoal through one workflow-owned output adapter instead of constructing downstream state inline.
- **ultragoal**: Typed obstacles are now authoritative for guard decisions, malformed obstacle ledgers fail closed, and completing a blocker goal resolves its matching obstacles.
- **agents**: Guarded Ralplan and Ultragoal execution selects standard bundled profiles, constructs explicit workflow prompts and metadata, and rejects runtime model/thinking/tool overrides before delegating to `subagent_spawn`.
- **agents**: The `explorer` profile is now a general read-only research agent: it pins `model: openai-codex/gpt-5.6-luna` to run bulk reading/reporting on a cheaper model, keeps read-only tools (`read`, `bash`), and supports two modes — ralplan skill mode (persists a `context_map` via the workflow tool) and general research mode (returns a concise cited report for use before deep-interview questions or other read-only investigation). System prompt and description updated accordingly.
- **build**: Workflows now copies its own runtime assets through a package-owned build script and can be bundled without reconstructing its package layout.
- **session**: Workflow-specific layout remains in Workflows while shared `.pi` root and path-segment primitives are provided by `@tsuuanmi/pi/session/root`.
- **subagent**: Moved reusable lifecycle tool execution to `@tsuuanmi/pi-agent`; workflows now retain only host adaptation, workflow receipts, and surface metadata.
- **extensions**: The package extension adapter is discovered from the package manifest and invoked through Pi's generic `ExtensionAPI` loader.
- **extensions**: Split workflow tool registration and workflow hook registration into focused modules; the package extension now composes both registrars.
- **team**: Moved manager acquisition into the Team agent adapter and added a fail-closed boundary check for direct `SubagentManager` calls.
- **team**: Split task, status, event, receipt, checkpoint, and event-sink responsibilities into focused workflow-owned modules; no mixed adapter module is retained.
- **team**: Team orchestrator adapter string fields now reject surrounding whitespace instead of normalizing values.
- **team**: Fresh and resume execution are separate APIs; failed execution state and all role receipts are persisted, including synthetic prover receipts; event records are idempotent.
- **team**: Reviewer and prover execution now fails closed unless the workflow records a passed gate with valid, non-blocking structured evidence; legal prover runs are accepted during `awaiting_integration`, and synthetic role failures and interrupted checkpoint receipts are persisted separately from task state.
- **ultragoal**: Checkpoint snapshot bookkeeping no longer stales freshly generated completion receipts.
- **team**: Reject stale or conflicting task execution writes while preserving identical retries.
- **team**: Resume only interrupted `running` checkpoints; completed and aborted checkpoints are terminal.
- **help**: Synchronize Team and Ultragoal command reference documents with generated workflow help.

### Fixed

- **commands**: Updated every skill action reference and schema to require the active session id, use executable `--input` examples, and match current stage, status, goal-mode, and blocker values.
- **team**: Team orchestrator agents now require the active host model and forward its canonical `provider/model` reference instead of the generic agent fallback model.

## [0.2.2] - 2026-07-23

### Breaking Changes

- **extensions**: Removed the built-in workflows extension entrypoint from `@tsuuanmi/pi-workflows`; `@tsuuanmi/pi` now owns the bundled registration layer.

### Added

- **ultragoal**: Added checkpointed task execution under one main goal, including state-only checkpoint snapshots and `restore-checkpoint` recovery for the latest valid checkpoint.
- **state**: Added a packaged JSON Schema for `pi workflow state <skill> <action>` payloads at `src/state/assets/schema.json`, copied to `dist/state/assets/schema.json` during builds.
- **commands**: `pi workflow --help` and `pi workflow <skill> --help` now show detailed workflow verbs, skill actions, options, examples, docs, and skill-local JSON schema references.
- **subagent**: Subagent tools now attach shared `@tsuuanmi/pi-agent` structured receipts for current-session status and inspection visibility.
- **subagent**: `subagent_spawn` now forwards explicit `visibility` through to the shared subagent manager, while guarded spawns omit it and stay native.
- **subagent**: Added `subagent_inspect`, `subagent_attach`, and `subagent_kill` tools for tmux-backed subagent live controls, including pane-aware attach targets surfaced from the shared manager contract.

## [0.2.0] - 2026-07-20

### Breaking Changes

- **workflows**: Moved the remaining shared/runtime workflow infrastructure out of `src/harness/` into top-level runtime, subagent, artifact, audit, orchestration, registry, session, and state paths; no `harness/*` compatibility wrappers are provided.
- **workflows**: Moved skill-owned TypeScript from `src/harness/<skill>/` to `src/skills/<skill>/` and updated public barrel exports to the new `skills/<skill>` paths; no `harness/<skill>` compatibility wrappers are provided.
- **workflows**: Moved tests from `test/harness/<category>/` to top-level `test/<src-dir>/` mirrors (`test/deep-interview`, `test/ralplan`, `test/runtime`, `test/team`, `test/ultragoal`, `test/session`, `test/audit`, `test/orchestration`, `test/state`, `test/registry`) and split `test/harness/team/team-ultragoal-workflow.test.ts` into `test/team/team-workflow.test.ts` and `test/ultragoal/ultragoal-workflow.test.ts`; no `test/harness/` directory remains.

### Added

- **ralplan**: Added a deterministic orchestration snapshot, pure expected-action selector, and journaled artifact completion transaction with provenance sidecars, idempotent same-hash handling, and doctor-visible journal health.
- **deep-interview**: Added first-class model-visible tools for planning questions, recording answers/scoring, reading derived state, closure checks, restating goals, and writing specs with current-session propagation.
- **subagent**: Workflow agent execution is exposed through model-visible tools (`subagent_spawn` / `subagent_status` / `subagent_await` / `subagent_steer` / `subagent_pause` / `subagent_resume` / `subagent_cancel`, `ralplan_run_agent`, `team_execute`, `team_resume`, `ultragoal_spawn_goal_agent`). Generic and Ultragoal tools use the main session's `SubagentManager`; team roles execute through `@tsuuanmi/pi-orchestrator`. pi-agent owns runtime agents; pi-workflows owns turn order, guarded role checks, persistence, and result→artifact handoff. No circular dependency.
- **agent**: Added `SubagentManagerFactory` registry (`registerSubagentManagerFactory`/`getSubagentManagerFactory`/`clearSubagentManagerFactoryForTests`) + `SubagentManagerFactoryContext` type, and `dispose(): Promise<void>` on the `SubagentManager` interface.
- **workflows**: `pi workflow <skill> <action>` CLI verbs now drive the retained skill runtime directly, replacing the removed in-process tool surface; the supported actions are documented by each skill’s current help metadata.
- **workflows**: Added a shared skill transition registry with per-skill transition tables.
- **team**: Added prover and reviewer gates for team workflows, including `pi workflow team record-completion-gate`, `pi workflow team record-review-gate`, fail-closed `evidence_matrix` / `review_report` validation, bounded retry escalation, and deterministic gate artifact storage.
- **ralplan**: Added an explorer pre-planner gate with `pi workflow ralplan record-explorer-gate`, fail-closed `context_map` validation, bounded retry escalation, and shared deterministic context-template builders for ralplan role prompts and tasks.
- **workflows**: Added scoped expected-next role helpers for guarded workflow execution, rejecting off-script role mismatches and runtime model/tool overrides in workflow-owned execution paths.
- **workflows**: Added state-driven `expectedNextRalplanRole`/`expectedNextTeamRole` selectors that compute the one legal next role from workflow state (ralplan artifact index + critic verdict branching; team lexicographic task selection). Workflow execution tools now refuse roles that do not match the state-computed legal role. The ralplan selector also models the explorer pre-planner gate, returning `{ stage: "pre-planner", role: "explorer" }` until a passing `context_map` is recorded, so planner execution is deterministically refused at the selector seam rather than only inside the role-agent runner.
- **workflows**: Added carried handoff contract fields for obstacles, deterministic final-package receipt assembly, shared HUD chip helpers, and a shared stage artifact writer.
- **ralplan**: Added expert-stage escalation with an `expert` role after iterate-cap or explorer-gate `human_blocked` escalation.
- **workflows**: Wired every bundled workflow agent profile into an end-to-end guarded spawn path: ralplan can spawn `explorer`/`expert`, team can spawn `reviewer`/`prover`, and worker remains shared by team and ultragoal.

### Fixed

- **ultragoal**: Quality-gate surface validation now uses generic app-automation terminology instead of tool-specific proof wording.
- **deep-interview**: Runtime guards now block common mutating `bash` commands during active interviews, require closure/restatement before `write-spec`, and use stricter per-component closure coverage.
- **commands**: `pi workflow` verbs now support `--input-file`, reject ambiguous `--input`/`--input-file` combinations, and keep manifest-declared skill verbs aligned with the dispatcher.
- **deep-interview**: Lateral-review personas are documented as subagent role labels using the default profile, avoiding missing bundled profile lookups.
- **workflows**: Package builds now clear generated skill/agent asset directories before copying source assets, preventing stale `dist/agents` profiles from persisting.
- **agents**: The bundled `expert` profile now includes required agent frontmatter, and bundled workflow agent prompts include more detailed artifact and gate persistence contracts.

- **workflows**: Skill instructions and docs now require current-session id propagation for every `pi workflow ...` command, document HUD visibility for command-created sessions (attach/switch model), and document model-visible-tool subagent spawning. Added `test/session/session-propagation.test.ts` covering same-session HUD active-state read and cross-session HUD isolation.
- **workflows**: Public expected-role selector helpers now register built-in transition tables through the package entrypoint, so consumers do not need side-effect imports before calling them.
- **ultragoal**: Completion quality-gate validation now reports missing nested fields together, and the skill docs include the full accepted `architectReview`/`executorQa`/`iteration` schema.
- **ralplan**: The explorer pre-planner gate no longer writes state with `force`; it goes through the normal manifest transition/tamper gate like the released ralplan artifact path, avoiding spurious `force_overwrite` audit entries.
- **team**: Prover `evidence_matrix` and reviewer `review_report` blocking artifacts now escalate to `human_blocked` on the second blocking attempt, matching the bounded-retry contract (previously only the missing-artifact path escalated).
- **deep-interview**: The per-round progress report and final spec templates are no longer wrapped in code fences, so the model emits them as rendered Markdown (tables/bold) instead of raw `|`/`**` code-block text.
- **commands**: The `@tsuuanmi/pi-workflows/commands/state-command` subpath export (declared in `package.json` `exports`) now resolves as a compatibility alias to `dist/commands/workflow.js`; previously it emitted `dist/cli/` while the export pointed at `dist/commands/`, so the subpath was broken.

### Changed

- **commands**: Split the oversized `src/commands/workflow.ts` implementation into focused `src/commands/workflow/` modules while keeping the public `commands/workflow` export and dispatcher wrapper stable.
- **workflows**: Moved workflow HUD rendering/building and extension UI registration helpers to `@tsuuanmi/pi-tui`; `pi-workflows` now only registers TUI HUD sync with workflow state.
- **commands**: Merged the standalone `state-command` implementation into `commands/workflow`; the `commands/state-command` subpath remains as a compatibility alias to the workflow command module.
- **deep-interview**: Option-bearing questions now explain each option in simple terms and include a recommended best option with a reason.
- **workflows**: A `sessionId` is now required on every `pi workflow ...` verb (deep-interview, ralplan, team, ultragoal, and `start`); the `generateSessionId()` fallback was removed entirely. No verb mints a session id; all fail closed with `sessionId is required` when it is missing.
- **workflows**: Spawn verbs are model-visible tools, not `pi workflow` commands. `pi workflow subagents <spawn|status|await|steer|pause|resume|cancel>`, `pi workflow ralplan run-agent`, `pi workflow team spawn-task-agent`, and `pi workflow ultragoal spawn-goal-agent` are no longer declared command verbs or special-cased by the workflow CLI. The tools spawn role agents as ordinary subagents of the main session via its `SubagentManager`, with the workflow computing the legal next role and refusing off-script spawns/overrides. Read-only and recovery verbs still work without a live owner.
- **workflows**: The detached `RuntimeOwner` is lifecycle-only. It no longer constructs or holds a `SubagentManager` and no longer handles any spawn verb — spawns are model-visible tools on the main session. The owner keeps `observe`/`classify`/`recover`/`validate`/`finalize`/`operate`/`submit`/`retire`, leases, GC, and events.
- **ralplan**: `ralplan_run_agent` now executes each guarded role stage through a workflow-owned `@tsuuanmi/pi-orchestrator` adapter. Ralplan retains role gates, artifact transactions, verdicts, and approval state; the adapter owns runtime agent execution, checkpoints, and task receipts.
- **workflows**: Workflow extension registration is now harness-driven; per-skill workflow tool registration is removed from the agent-visible surface.
- **subagent**: `subagent_spawn` now returns a multi-line receipt showing the agent profile, model, role, label, detached flag, and a truncated task prompt, instead of only the subagent id and status.
- **ralplan**: `pi workflow ralplan approve-plan` now refuses to approve a plan whose latest critic verdict is REJECT; set `overrideCriticVerdict: true` to force approval. A latest critic verdict of ITERATE produces a soft warning instead of blocking, and the approval result now carries `critic_verdict`, `critic_verdict_overridden`, and `approval_warning`. `pi workflow ralplan doctor` warns when a pending plan's latest critic verdict is REJECT or ITERATE. This enforces the documented workflow intent that a final plan should not be approved over a critic REJECT.
- **workflows**: Fail-soft handoff/obstacle ingest failures now record a durable `fail_soft_error` audit entry and surface `fail_soft_errors` on the ralplan approve receipt, instead of only logging to stderr. A new `handoff-no-ingest-handler` fail-soft site surfaces carried obstacles that have no ingest handler for the callee skill (e.g. team).
- **commands**: Moved the workflow CLI command modules from `src/cli/{workflow-command,state-command}.ts` to `src/commands/workflow.ts` to match the declared `commands/` public layout. `package.json` `pi.commands` now registers only `src/commands/workflow.ts` (`pi workflow state` is a nested verb, not a top-level command). The workflow command module exports a `handlePackageCommand(args, ctx?)` alias (delegating to `handleWorkflowCommand`) to conform to `pi`'s package-command dispatcher contract; `handleWorkflowCommand`/`runWorkflowCommand`/`runStateCommand` remain exported unchanged.

### Removed

- **workflows**: Removed the write-only `carried_decisions` handoff field and `HandoffCarriedDecision` type (reverts an unreleased addition; no consumer read them).
- **workflows**: Removed unused byte-estimation and tail-truncation helpers that were referenced only by their own tests.
- **workflows**: Removed the workflow tool-pruning feature and its legacy model-visible workflow tool registry: the `workflows.pruneInactiveTools` extension flag, the `applyWorkflowToolPruning` session/before-start handler logic in the workflows extension, and the `harness/shared/tool-groups.ts` pruning helpers (`selectWorkflowActiveTools`, `resolveActiveWorkflowSkills`, `sameToolSet`, `WORKFLOW_OWNED_TOOLS`, `WORKFLOW_SKILL_TOOLS`, and the per-skill tool arrays). Workflow-owned operations now use the canonical `pi workflow ...` control plane instead of registering `deep_interview_*`, `ralplan_*`, `team_*`, or `ultragoal_*` tools. The unrelated `pi workflow gc --prune` session-directory GC is unaffected.
