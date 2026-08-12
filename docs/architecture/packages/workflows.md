# `@tsuuanmi/pi-workflows`

[Package README](../../../packages/workflows/README.md) | [Source map](../../../packages/workflows/docs/source-tree.md) | [Workflow reference](../../../packages/workflows/docs/workflow.md) | [Public barrel](../../../packages/workflows/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi-workflows` is Pi's workflow-policy and durable workflow-runtime package. It owns four gated skills - Deep Interview, Ralplan, Team, and Ultragoal - plus their state transitions, tools, commands, artifacts, receipts, audit records, and host integration.

It composes generic Agent and Orchestrator capabilities. It does not replace either execution engine.

## Boundary

**Owns**

- Skill phases, legal transitions, expected-next guards, closure/approval/quality gates, and cross-skill handoffs.
- Model-visible workflow tools and the independent `pi workflow` command control plane.
- Session-scoped workflow state, active HUD state, plans/specs/boards/goals, artifacts, receipts, audit logs, ledgers, and journals.
- Workflow manifests, action/help metadata, tool surfaces, transition registry, and validation.
- Workflow-specific Agent/Orchestrator adapters for role, task, team, and goal execution.
- Pi extension registration and hooks, including HUD refresh and Deep Interview mutation restrictions.
- A detached lifecycle owner for lease/heartbeat/recovery/finalization of external workflow state.

**Does not own**

- The provider protocol or model streaming; AI owns it.
- The generic single-agent loop or tool protocol; Agent owns those contracts. Orchestrator owns the concrete session-aware subagent backend.
- Generic task routing, retries, verification, concurrency, or checkpoint schema; Orchestrator owns those primitives.
- Terminal rendering primitives; TUI owns them.
- Pi startup, package/resource loading, session prompt assembly, settings, or concrete UI.
- Subagent execution inside the detached `RuntimeOwner`; it is lifecycle-only by design.

## Public entry points

| Import | Surface |
|---|---|
| `@tsuuanmi/pi-workflows` | Broad root API for workflow manifests, state/runtime contracts, audit/artifacts/policy, and substantial skill APIs |
| `@tsuuanmi/pi-workflows/commands/workflow` | Package/workflow command handlers and result contract |
| `@tsuuanmi/pi-workflows/tool` | Workflow context, host/tool specs, registration, and static subagent surfaces |
| `@tsuuanmi/pi-workflows/hooks` | Workflow hook registration and HUD refresh |
| `@tsuuanmi/pi-workflows/extension` | Default Pi extension factory |
| `@tsuuanmi/pi-workflows/runtime/*` | Published runtime modules through a wildcard subpath |
| `@tsuuanmi/pi-workflows/package.json` | Package metadata |

The root barrel imports transition modules for registration side effects. `#workflows/*` aliases are internal.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Extension adapter | [`src/extension.ts`](../../../packages/workflows/src/extension.ts) | Registers workflow tools and lifecycle hooks in a Pi-compatible host |
| Tool adapter | [`src/tool/`](../../../packages/workflows/src/tool) | Workflow tool contracts and registration for all four skills; Pi owns lifecycle registration |
| CLI control plane | [`src/commands/workflow/`](../../../packages/workflows/src/commands/workflow) | Parses and dispatches lifecycle, state, and skill commands without calling model-visible tools |
| Registry/manifests | [`src/registry/`](../../../packages/workflows/src/registry) | Runtime phases, transitions, retention, help/action metadata, and validated surfaces |
| Policy/handoffs | [`src/policy/`](../../../packages/workflows/src/policy), [`src/handoff/`](../../../packages/workflows/src/handoff) | Cross-workflow prompts, expected-next guards, gate verdicts, and legal handoffs |
| Session paths | [`src/session/`](../../../packages/workflows/src/session) | Explicit session resolution and canonical paths for state, artifacts, specs, plans, and ledgers |
| State | [`src/state/`](../../../packages/workflows/src/state) | Workflow ids, schemas, atomic writes, active HUD state, and validation |
| Artifacts/audit | [`src/artifacts/`](../../../packages/workflows/src/artifacts), [`src/audit/`](../../../packages/workflows/src/audit) | Durable artifacts, receipts, append-only audit, decisions, tamper evidence, and transaction journals |
| Detached runtime | [`src/runtime/`](../../../packages/workflows/src/runtime) | Lifecycle owner, mutation transaction, storage, leases, events, recovery, runner, and deferred seams |
| Agent profiles | [`src/agents/`](../../../packages/workflows/src/agents) | Bundled role profiles and parsing/validation |
| Skills | [`src/skills/`](../../../packages/workflows/src/skills) | Deep Interview, Ralplan, Team, and Ultragoal policy and persistence |

## Skill components

| Skill | Owns | Typical handoff |
|---|---|---|
| Deep Interview | Question topology, answer/scoring rounds, ambiguity, closure, goal restatement, and spec persistence | Ralplan, Ultragoal, Team, or stop |
| Ralplan | Explorer/planner/architect/critic/revision stages, evidence, artifact review, consensus, and approval | Approved implementation plan |
| Team | Durable task board, role selection, messages, gates, Orchestrator adapter, worker/reviewer/prover execution | Completed team result and receipts |
| Ultragoal | Approved goal plan, autonomous goal agents, checkpoints, quality gates, blockers, and completion receipts | Completed goal run |

Skill-local source owns domain policy. Shared orchestration and session-aware subagent execution belong in Orchestrator; the main application session belongs in Pi.

## Two execution surfaces

### Interactive/model-visible tools

```text
Pi extension loader
  -> workflowExtension
  -> registerWorkflowTools + registerWorkflowHooks
  -> typed tool call with WorkflowContext
  -> validate session and expected phase
  -> invoke injected SubagentManagerApi / Orchestrator adapter if needed
  -> atomically update state/artifacts/audit/receipts
  -> refresh HUD
```

### External CLI control plane

```text
pi workflow ...
  -> workflow command parser
  -> explicit session resolution
  -> lifecycle/state/skill command implementation
  -> durable state mutation and command result
```

The CLI and tool paths share lower-level state and policy modules, but neither invokes the other. This keeps argument parsing separate from model tool execution.

## Dependencies

### Workspace runtime

| Dependency | Contract used |
|---|---|
| `@tsuuanmi/pi` | Public `.pi` roots and base session layout extended by workflow paths |
| `@tsuuanmi/pi-ai` | Model/context/event stream types used by workflow agent adapters |
| `@tsuuanmi/pi-agent` | Agent, tool, model/thinking-level, receipt, Node path/JSONL, and mutation contracts |
| `@tsuuanmi/pi-orchestrator` | Task/team scheduling, checkpoints, verification, routing, events, metrics, and receipts |
| `@tsuuanmi/pi-tui` | Workflow HUD contracts and refresh integration |

### External runtime

| Dependency | Why it is used |
|---|---|
| `typebox` | Typed workflow tool schemas and validation |

The package also uses Node filesystem, path, process, crypto, socket, and timing APIs.

## Interaction with Pi

Workflows imports Pi's public host/session contracts and orchestrator's public subagent contracts. Runtime integration otherwise uses host-shaped contracts and published seams:

- Pi's package/resource loader discovers the bundled Workflows extension, skills, agent profiles, and command.
- Pi supplies tool registration, event hooks, current session context, generic session services, and UI refresh.
- `workflowExtension` installs the orchestrator subagent runtime, then registers workflow tools and hooks.
- Workflows imports published Pi session-root APIs so skill paths extend Pi's base session layout without private aliases.
- Pi's interactive mode reads strict session-owned active workflow state for the status line.
- Workflows consumes orchestrator-provided subagent services through public package exports and never imports Pi or orchestrator internals.

## Persistence boundaries

Workflows has two related durable domains:

1. **Session workflow data** under `.pi/<session-id>/`, including active state, skill state, specs, plans, boards, goals, artifacts, audit, receipts, and handoff records.
2. **Detached harness-owner state** under the configured harness state root, used for runtime ownership, leases, heartbeats, lifecycle events, and recovery.

Every logical workflow carries an explicit `sessionId`. Commands may resolve it only from explicit command input, payload, or `PI_SESSION_ID`; they do not scan for the latest session. Missing, malformed, stale, cross-session, or off-sequence state fails closed.

Writes use the mechanism appropriate to each schema: serialized mutation queues, atomic file replacement, append-only JSONL, hashes, receipts, audit entries, or a skill-specific transaction journal. The architecture does not imply one global transaction across every workflow file.

## Detached runtime boundary

`RuntimeOwner` owns external lifecycle state and RPC routing over a local socket. It can submit, recover, validate, finalize, operate, and retire workflow runs. It intentionally has no `SubagentManager`; extension-host execution remains the path for starting a subagent.

`mutateRuntimeSession()` serializes and validates lifecycle mutations before writing state, events, and receipt-family updates. `operate()` performs a bounded observe/recover loop and only finalizes after explicit completion evidence.

## Extension points

- `WorkflowToolHost`, `WorkflowToolSpec`, and `registerWorkflowTools()` for compatible hosts.
- Skill transition tables, runtime manifests, help/action metadata, and validated tool surfaces.
- Orchestrator-provided `SubagentManagerApi` and workflow-specific Agent/Orchestrator adapters.
- Runtime storage roots, clocks, owner/lease settings, mutation observers, and registered receipt rules.
- Deferred seam registry for explicitly designed but unavailable runtime capabilities; unregistered use fails closed.

## Runtime and distribution constraints

- ESM; Node.js 22.19 or newer.
- Source changes require rebuilding `dist` before workspace tests consume the package.
- Build copies skill markdown, schemas, references, scripts, state assets, and agent profiles into `dist`.
- Pi additionally bundles the compiled package and selected workflow assets into its published CLI distribution.
- Exact transition source phases and session identity are mandatory; wildcard compatibility transitions are not supported.
