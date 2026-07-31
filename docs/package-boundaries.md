# Package Boundaries

This document defines the intended package boundaries for Pi and lists overlap cleanup tasks by ROI. See [`package-overlap-audit.md`](./package-overlap-audit.md) for concept-level cleanup decisions, [`workflow-orchestrator-overlap.md`](./workflow-orchestrator-overlap.md) for workflow-specific findings, [`receipt-boundaries.md`](./receipt-boundaries.md) for receipt ownership rules, and [`persistence-boundaries.md`](./persistence-boundaries.md) for state ownership rules.

## Layer model

```text
@tsuuanmi/pi-ai
  -> @tsuuanmi/pi-agent
    -> @tsuuanmi/pi-orchestrator
      -> @tsuuanmi/pi-workflows
        -> @tsuuanmi/pi
```

The direction means higher layers may use lower layers. Lower layers must not depend on higher layers.

## Package ownership

| Package | Owns | Must not own |
| --- | --- | --- |
| `@tsuuanmi/pi-ai` | Provider/model APIs, message content transport, streaming primitives | Agent loop, tools, orchestration, workflows, CLI/UI |
| `@tsuuanmi/pi-agent` | Single-agent runtime, standard tool protocol, tool registry APIs, message state, subagents, tool receipts | Concrete Pi tools, workflow tools, multi-agent task scheduling, workflow state, CLI/UI |
| `@tsuuanmi/pi-orchestrator` | Generic task DAG orchestration over `Agent`s: `Task`, `TaskQueue`, `Team`, scheduling, routing, checkpoints, task receipts | Pi workflow commands, skill UX, CLI session state, file artifacts |
| `@tsuuanmi/pi-workflows` | Pi workflow skills, workflow tools, workflow commands, workflow runtime state, workflow-specific policies | Low-level agent loop, model provider transport, generic task engine internals |
| `@tsuuanmi/pi` | CLI, TUI integration, session manager, resource loading, extension runtime, built-in tools | Generic orchestration engine, workflow business logic, provider internals |

## Hard boundary rules

- Each concept has one owner; do not add shared ownership, fallback ownership, or compatibility wrappers.
- Higher layers may call lower layers only through public APIs.
- Lower layers must not import higher layers.
- Adapters live in the higher layer that needs the integration.
- Names must identify the owning layer when a term overlaps, such as workflow team state versus orchestrator `Team`.

## Dependency rules

The dependency rules are enforced by:

```bash
npm run check:package-boundaries
```

The checker scans `packages/*/src/**/*.ts` and fails on forbidden workspace package imports. Update `scripts/check-package-boundaries.mjs` and this document together when a boundary intentionally changes.

Allowed direction:

```text
pi-agent -> pi-ai
pi-orchestrator -> pi-agent
pi-workflows -> pi-agent
pi-workflows -> pi-orchestrator, when a workflow needs generic task/team orchestration
pi -> pi-agent
pi -> pi-workflows
pi -> pi-ai
pi -> pi-tui
```

Forbidden dependencies:

```text
pi-agent -> pi-orchestrator
pi-agent -> pi-workflows
pi-orchestrator -> pi-workflows
pi-orchestrator -> pi
pi-workflows -> pi
pi-workflows -> pi/*
```

`@tsuuanmi/pi-workflows` must not import `@tsuuanmi/pi` or any `@tsuuanmi/pi/*` subpath. Pi app APIs must be passed into workflows through explicit workflow-owned seams instead of direct package imports. `@tsuuanmi/pi-orchestrator` must not import workflow code, workflow storage, workflow gates, workflow receipts, or workflow artifacts.

## Boundary diagram

```text
┌─────────────────────────────────────────────┐
│ @tsuuanmi/pi                                │
│ CLI, TUI, sessions, resource loading         │
│ Wires extensions/tools/skills                │
└─────────────────────▲───────────────────────┘
                      │ uses
┌─────────────────────┴───────────────────────┐
│ @tsuuanmi/pi-workflows                      │
│ Workflow skills, commands, tools, state      │
│ Product-level automation                     │
└──────────────▲────────────────────▲─────────┘
               │ optional uses       │ uses
┌──────────────┴─────────────┐  ┌───┴────────────────┐
│ @tsuuanmi/pi-orchestrator  │  │ @tsuuanmi/pi-agent │
│ Task DAG, team scheduling  │  │ Agent runtime/tools │
│ checkpoints/task receipts  │  │ messages/subagents  │
└──────────────▲─────────────┘  └───▲────────────────┘
               │ uses               │ uses
               └────────────────────┘
                       │
              ┌────────┴────────┐
              │ @tsuuanmi/pi-ai │
              │ Providers/models │
              └─────────────────┘
```

## Rule of thumb

- If it is about the standard tool protocol, registry, or one agent executing registered tools, it belongs in `@tsuuanmi/pi-agent`.
- If it is about many agents executing a task DAG, it belongs in `@tsuuanmi/pi-orchestrator`.
- If it is about a named Pi workflow or skill with user-facing state, it belongs in `@tsuuanmi/pi-workflows`.
- If it is about concrete Pi tools, CLI, sessions, TUI, or resource loading, it belongs in `@tsuuanmi/pi`.

## Receipt ownership

| Receipt | Owner | Purpose | Boundary rule |
| --- | --- | --- | --- |
| Tool receipt | `@tsuuanmi/pi-agent` | Evidence for one tool execution inside one agent run | Must not own task routing or workflow state |
| Task receipt | `@tsuuanmi/pi-orchestrator` | Evidence for one orchestrated task, including routing, retries, and metrics | Must not own workflow state or artifact layout |
| Workflow receipt | `@tsuuanmi/pi-workflows` | Evidence for workflow actions and workflow state transitions | May reference tool/task receipt ids but must not own their schemas |

## Persistence ownership

| State | Owner | Contract |
| --- | --- | --- |
| Agent state | `@tsuuanmi/pi-agent` | Runtime message/tool state for one agent |
| Orchestrator checkpoint | `@tsuuanmi/pi-orchestrator` | Strict versioned run checkpoint behind `OrchestratorCheckpointStore` |
| Workflow state | `@tsuuanmi/pi-workflows` | Workflow/session state, runtime ownership, and workflow recovery |
| Pi session state | `@tsuuanmi/pi` | CLI session, config, extension, and UI state |

Rules:

- Orchestrator checkpoint stores are abstract interfaces.
- Workflows may implement an orchestrator checkpoint store.
- Orchestrator must not import workflow storage.
- Pi must not interpret orchestrator checkpoint internals except through package APIs.

## Overlap map

| Overlap area | Risk | Owner |
| --- | --- | --- |
| Team concepts | Generic `Team` can be confused with workflow team skill state | `pi-orchestrator` owns generic teams; `pi-workflows` owns workflow team behavior |
| Task state | Generic DAG tasks can be confused with workflow task/status state | `pi-orchestrator` owns DAG tasks; `pi-workflows` owns workflow-specific state |
| Checkpoints | Orchestrator run checkpoints can be confused with workflow session state | `pi-orchestrator` owns run checkpoints; `pi-workflows` owns workflow session state |
| Receipts | Tool receipts, task receipts, and workflow receipts can overlap | `pi-agent` owns tool receipts; `pi-orchestrator` owns task receipts; `pi-workflows` owns workflow receipts |
| Routing | Agent selection can overlap with workflow expected-role rules | `pi-orchestrator` owns generic routing; `pi-workflows` owns workflow role policy |
| Events | Agent lifecycle, queue events, and workflow events can overlap | Each package owns events for its layer |
| Artifacts | Task output can be confused with user-facing workflow artifacts | `pi-workflows` owns artifact storage and display semantics |
| Governance | Dispatch/consequential gates can overlap with workflow gates | `pi-orchestrator` owns generic gates; `pi-workflows` owns workflow policy gates |

## Overlap cleanup tasks by ROI

| Rank | Task | ROI | Target package(s) | Reason |
| ---: | --- | --- | --- | --- |
| 1 | Document and enforce import direction between packages | Very high | all packages | Prevents new boundary violations with low implementation cost |
| 2 | Rename or document workflow team concepts so they do not imply `orchestrator.Team` | High | `pi-workflows` | Reduces confusion around the highest-overlap term |
| 3 | Audit task/status types in workflows and orchestrator for duplicated generic DAG semantics | High | `pi-workflows`, `pi-orchestrator` | Identifies workflow code that should use orchestrator instead of local task abstractions |
| 4 | Split receipt terminology in docs: tool receipt, task receipt, workflow receipt | High | `pi-agent`, `pi-orchestrator`, `pi-workflows` | Makes audit records clear and prevents cross-layer schema drift |
| 5 | Define checkpoint vs workflow-state persistence contracts side by side | High | `pi-orchestrator`, `pi-workflows` | Clarifies recovery responsibilities and avoids storage coupling |
| 6 | Add package-boundary checks for forbidden imports | Medium-high | repo scripts | Makes the boundary enforceable in CI |
| 7 | Evaluate whether workflow `team` or `ultragoal` should call `Orchestrator` internally | Medium | `pi-workflows`, `pi-orchestrator` | Converts real DAG/team execution to the generic engine only where valuable; no fallback path remains after approval |
| 8 | Normalize event naming docs across agent, orchestrator, and workflows | Medium | `pi-agent`, `pi-orchestrator`, `pi-workflows` | Improves observability without merging event systems |
| 9 | Add adapter examples for workflow-owned checkpoint stores backed by workflow storage | Medium | `pi-workflows`, `pi-orchestrator` | Shows integration without making orchestrator depend on workflow storage |
| 10 | Consider shared memory only after workflow/orchestrator task overlap is resolved | Low-medium | `pi-workflows`, `pi-orchestrator` | Larger API/storage design; not needed for boundary clarity |
| 11 | Consider delegation support only with a concrete workflow use case | Low | `pi-agent`, `pi-orchestrator`, `pi-workflows` | Broad runtime/tool coupling risk |
| 12 | Avoid porting full coordinator synthesis into orchestrator | Low | `pi-orchestrator` | Workflow-specific product behavior should remain in workflows |

## Recommended next steps

1. Keep `npm run check:package-boundaries` passing as package relationships evolve.
2. Audit `pi-workflows` task/team/receipt/checkpoint concepts and classify each as workflow-specific or generic orchestration.
3. Move only generic DAG/team execution needs in workflows to `pi-orchestrator`.
4. Keep `pi` as the integration shell and avoid adding orchestration or workflow business logic there.
