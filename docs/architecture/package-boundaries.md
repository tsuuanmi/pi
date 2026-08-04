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
| `@tsuuanmi/pi-agent` | Single-agent runtime, standard tool protocol, tool registry APIs, message state, subagent lifecycle contracts, tool receipts, Node process and shell primitives | Pi-specific Bash/output adapters, subagent sessions, tmux, multi-agent task scheduling, workflow state, CLI/UI |
| `@tsuuanmi/pi-orchestrator` | Generic task DAG orchestration over `Agent`s: `Task`, `TaskQueue`, `Team`, scheduling, routing, checkpoints, task receipts | Pi workflow commands, skill UX, CLI session state, file artifacts |
| `@tsuuanmi/pi-workflows` | Pi workflow skills, workflow tools, workflow commands, workflow runtime state, workflow-specific policies | Low-level agent loop, model provider transport, generic task engine internals |
| `@tsuuanmi/pi` | CLI, TUI integration, session manager, resource loading, extension runtime, built-in tools, Pi Bash/output adapters, concrete `SubagentManager` sessions, Pi-native subagent controls, and tmux integration | Generic process primitives, generic orchestration engine, workflow business logic, provider internals |

## Execution boundary

| Operation | Owner | Allowed integration |
| --- | --- | --- |
| Run one agent and execute its tools | `@tsuuanmi/pi-agent` | Hosts provide models, tools, and runtime inputs |
| Spawn or control one Pi-native subagent session | `@tsuuanmi/pi` through the `@tsuuanmi/pi-agent` manager contract | Workflow lifecycle tools may call the injected manager; Pi-native controls use Pi's host context directly |
| Schedule, route, retry, or coordinate multiple agents | `@tsuuanmi/pi-orchestrator` | Workflows provide `Agent` instances through workflow-owned adapters |
| Enforce a named workflow's roles, gates, and artifacts | `@tsuuanmi/pi-workflows` | Use the manager only for a workflow-specific single-worker step |

A direct `SubagentManager` call is valid only for lifecycle control or a single workflow-owned worker. Generic dependencies, queues, routing, retries, and multi-agent collaboration must use `@tsuuanmi/pi-orchestrator`.

The semantic boundary checker allows direct manager calls only in these workflow adapters:

- `packages/workflows/src/subagents/tools.ts` for workflow lifecycle tools;
- `packages/workflows/src/skills/team/agent-adapter.ts` for the `Agent` bridge;
- `packages/workflows/src/skills/ralplan/agent-adapter.ts` for Orchestrator-backed role execution;
- `packages/workflows/src/skills/ultragoal/tools.ts` for one guarded goal worker.

Unknown manager call sites fail the check instead of falling back to another execution engine.

Pi-native controls in `packages/pi/src/subagents/` are host-owned, not workflow adapters. They may use the concrete Pi manager for inspection, attach, and kill, but must not import workflow tool contracts or workflow receipt assembly.

## Hard boundary rules

- Each concept has one owner; do not add shared ownership, fallback ownership, or compatibility wrappers.
- Higher layers may call lower layers only through public APIs.
- Lower layers must not import higher layers.
- Adapters live in the higher layer that needs the integration.
- Names must identify the owning layer when a term overlaps, such as workflow team state versus orchestrator `Team`.
- Do not create a second execution path for behavior already owned by `@tsuuanmi/pi-orchestrator`.
- Keep process spawning, waiting, termination, and shell resolution in `@tsuuanmi/pi-agent/node`; keep Pi-specific Bash backends, output policy, and process lifecycle registration in `@tsuuanmi/pi`.

## Dependency rules

The dependency rules are enforced by:

```bash
npm run check:package-boundaries
```

The checker scans `packages/*/src/**/*.ts`, validates package and alias boundaries, and rejects workflow manager calls outside the explicit adapter allowlist. Update `scripts/check-package-boundaries.mjs` and this document together when a boundary intentionally changes.

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
- If it is about a named Pi workflow or skill with user-facing state, it belongs in `@tsuuanmi/pi-workflows`; it may call the orchestrator through an adapter.
- If it is about one subagent's lifecycle, it belongs behind the injected `SubagentManager` contract, not in the orchestrator.
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

Completed guardrails:

- Package ownership and execution direction are documented and enforced.
- Direct manager calls are limited to approved lifecycle adapters.
- Team uses `Orchestrator` for multi-agent coordination.
- Workflow manifest and transition compatibility paths have been removed.
- Active-state and handoff identity are versioned and strictly session-scoped.

| Rank | Task | ROI | Target package(s) | Exit criteria |
| ---: | --- | --- | --- | --- |
| 1 | Reconcile Team dependency and recovery semantics with `TaskQueue` | High | `pi-workflows`, `pi-orchestrator` | One owner for `depends_on`/`blocked_by`; resume and failure recovery are deterministic |
| 2 | Remove remaining Ultragoal legacy/dual-write paths | High | `pi-workflows` | Obstacle, quality-gate, and receipt state use one canonical schema and write path |
| 3 | Complete receipt reference boundaries | Medium-high | all packages | Workflow receipts reference task/tool IDs without importing lower-layer schemas |
| 4 | Prove workflow-owned checkpoint recovery parity | Medium-high | `pi-workflows`, `pi-orchestrator` | Restart and interrupted-task recovery are idempotent and package-independent |
| 5 | Normalize event ownership and adapter documentation | Medium | all packages | Cross-layer event mappings are explicit and layer-owned |
| 6 | Define approved Ralplan output adapters | Medium-low | `pi-workflows`, `pi-orchestrator` | Approved plans map to task inputs without moving planning policy |
| 7 | Evaluate Ultragoal integration only for a real generic DAG | Low-medium | `pi-workflows`, `pi-orchestrator` | No adapter exists without independent goals and generic dependencies |
| 8 | Defer shared memory and new delegation APIs | Low | all packages | No speculative shared state or lifecycle facade is added |

## Recommended next steps

1. Keep `npm run check:package-boundaries` passing as package relationships evolve.
2. Audit Team dependency and recovery semantics before changing any workflow-to-orchestrator mapping.
3. Keep `pi` as the integration shell and avoid adding orchestration or workflow business logic there.
