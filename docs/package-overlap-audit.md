# Package Overlap Audit

This audit turns package-boundary rules into actionable cleanup tasks. It focuses on concepts shared by `@tsuuanmi/pi-agent`, `@tsuuanmi/pi-orchestrator`, `@tsuuanmi/pi-workflows`, and `@tsuuanmi/pi`. See [`workflow-orchestrator-overlap.md`](./workflow-orchestrator-overlap.md) for workflow-specific findings, [`team-workflow-orchestrator-adapter.md`](./team-workflow-orchestrator-adapter.md) for the team adapter design, [`receipt-boundaries.md`](./receipt-boundaries.md) for receipt ownership rules, and [`persistence-boundaries.md`](./persistence-boundaries.md) for state ownership rules.

## Decision rules

- Keep generic single-agent execution in `@tsuuanmi/pi-agent`.
- Keep generic multi-agent task DAG execution in `@tsuuanmi/pi-orchestrator`.
- Keep named Pi workflow state and UX in `@tsuuanmi/pi-workflows`.
- Keep CLI, TUI, sessions, and extension wiring in `@tsuuanmi/pi`.
- Do not add compatibility shims or fallback ownership when a concept has one clear owner.

## Overlap decisions

| Concept | Current locations | Owner | Action | Priority |
| --- | --- | --- | --- | --- |
| Single agent run loop | `pi-agent`, workflow runners may invoke agents | `pi-agent` | Keep loop and tool execution in `pi-agent`; workflows call agents through public APIs only | P0 |
| Generic task DAG | `pi-orchestrator`, workflow skills may model task lists | `pi-orchestrator` | Audit workflow task lists; move only generic DAG execution to orchestrator | P0 |
| Workflow task/status state | `pi-workflows`, `pi-orchestrator` task status | `pi-workflows` for workflow UX state | Keep workflow-facing state separate from `TaskQueue`; map between them through adapters when needed | P0 |
| Team roster | `pi-orchestrator` `Team`, workflow team skill state | Split ownership | `Team` means runtime agent roster in orchestrator; workflow team state should use workflow-specific names | P0 |
| Routing | `pi-orchestrator` agent selection, workflow expected-role policy | Split ownership | Generic requirement-based routing stays in orchestrator; workflow role policy stays in workflows | P0 |
| Checkpoints | `pi-orchestrator` checkpoints, workflow state, Pi session state | Split ownership | Keep orchestrator checkpoints versioned and generic; workflows may implement stores without importing into orchestrator | P0 |
| Receipts | agent tool receipts, orchestrator task receipts, workflow receipts | Split ownership | Document schema boundaries; workflow receipts may reference lower-layer receipt ids, not own their schemas | P0 |
| Events | agent lifecycle, queue events, workflow events, Pi UI events | Split ownership | Keep event names layer-scoped; bridge events at package boundaries through explicit adapters | P1 |
| Artifacts | task output, workflow artifacts, Pi files | `pi-workflows` for user-facing artifacts | Orchestrator returns data; workflows decide artifact storage and display | P1 |
| Governance | orchestrator dispatch/consequential gates, workflow gates | Split ownership | Generic task gates stay in orchestrator; workflow-specific gates stay in workflows | P1 |
| Persistence locks/leases | workflow runtime storage, Pi sessions | `pi-workflows` / `pi` | Do not move leases into orchestrator; keep checkpoint store abstract | P2 |
| Coordinator synthesis | workflow planning skills, orchestrator planner | Split ownership | Orchestrator planner stays generic; workflow planning UX remains workflow-owned | P2 |
| Shared memory | possible in workflows and orchestrator | Undecided | Do not add until a concrete workflow requires generic cross-task memory | P3 |
| Delegation | agent subagents, workflows, orchestrator | Undecided | Do not add until a concrete workflow use case defines ownership | P3 |

## ROI-ranked cleanup tasks

| Rank | Task | ROI | Output |
| ---: | --- | --- | --- |
| 1 | Enforce package import boundaries | Very high | `scripts/check-package-boundaries.mjs` in root `check` |
| 2 | Audit workflow task/team concepts against orchestrator concepts | Very high | Follow-up issue list for `packages/workflows/src/skills/team` and `ultragoal` |
| 3 | Clarify receipt terminology in package docs | High | Tool/task/workflow receipt sections in relevant docs |
| 4 | Define checkpoint vs workflow-state contracts | High | Persistence boundary docs and adapter guidance |
| 5 | Add workflow-owned orchestrator checkpoint-store example | Medium-high | Example adapter that imports orchestrator from workflows, never the reverse |
| 6 | Evaluate `team` workflow for orchestrator integration | Medium | Decision doc: keep custom workflow state or use `Orchestrator.run` internally |
| 7 | Evaluate `ultragoal` workflow for orchestrator integration | Medium | Decision doc: map goal steps to task DAG only if generic enough |
| 8 | Normalize event naming docs across layers | Medium | Event ownership table and adapter examples |
| 9 | Add receipt reference ids across layers | Medium | Optional stable ids without schema ownership leakage |
| 10 | Consider shared memory | Low | Only with concrete storage and ownership requirements |
| 11 | Consider delegation | Low | Only with concrete cross-package runtime design |

## Workflow integration checklist

Use this checklist before moving workflow code to orchestrator:

1. Does the workflow need a generic task DAG?
2. Does it assign tasks to a roster of `Agent`s?
3. Are task requirements expressible as `TaskRequirements`?
4. Can workflow state map to/from `TaskSnapshot` without leaking workflow internals?
5. Can workflow storage implement `OrchestratorCheckpointStore` without orchestrator importing workflow code?
6. Can queue events drive the workflow HUD through a workflow-owned adapter?
7. Are workflow receipts only referencing task receipts instead of duplicating their schema?

If any answer is no, keep the behavior in `pi-workflows` until the boundary is clearer.

## Do not move

Do not move these workflow concepts into orchestrator:

- workflow command handlers
- workflow HUD state
- workflow session storage layout
- runtime leases or owners
- expected-next-role policy
- skill-specific gate wording
- user-facing artifact file layout

These are product workflow concerns, not generic orchestration concerns.
