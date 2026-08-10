# Package Overlap Audit

This audit identifies similar concepts across all seven workspace packages and decides whether each similarity is:

- **canonical ownership** - one package owns the implementation;
- **an adapter** - a consumer translates an owned contract without reimplementing it;
- **intentional split ownership** - layers own different guarantees under similar names;
- **duplicate or ambiguous logic** - cleanup or an explicit architecture decision is required.

For exact import, load, injection and data-handoff paths, see [Component Integration Map](component-integration-map.md). For allowed dependency direction, see [Package Boundaries](package-boundaries.md). File-level remediation is tracked in [Package Overlap Implementation](package-overlap-implementation.md).

Workflow-specific detail remains in:

- [Orchestrator vs. Workflows](orchestrator-vs-workflows.md)
- [Workflow Orchestrator Overlap](workflow-orchestrator-overlap.md)
- [Ralplan Orchestrator Contract](ralplan-orchestrator-contract.md)
- [Team Workflow Orchestrator Adapter](team-workflow-orchestrator-adapter.md)
- [Receipt Boundaries](receipt-boundaries.md)
- [Persistence Boundaries](persistence-boundaries.md)

## Executive conclusion

The current tree has one canonical core engine for each major responsibility:

| Core responsibility | Canonical owner | Current duplicate engine found? |
|---|---|---|
| Provider/model protocol and stream registry | `@tsuuanmi/pi-ai` | No |
| Single-Agent model/tool loop | `@tsuuanmi/pi-agent` | No |
| Task DAG, scheduler and multi-Agent execution | `@tsuuanmi/pi-orchestrator` | No |
| Terminal input/component/render loop | `@tsuuanmi/pi-tui` | No |
| Named workflow policy/state/artifacts | `@tsuuanmi/pi-workflows` | No |
| CLI/SDK/session/extension application host | `@tsuuanmi/pi` | No |
| Concrete Pi subagent manager and worker backends | Pi, using generic Agent contracts | No second implementation found |

The primary architecture is therefore sound: higher packages generally import or inject lower-package components instead of copying their engines.

The audit did find smaller duplicate shapes, ambiguous ownership, packaging compensation, and one latent execution-boundary violation. These are listed in [Current overlap findings](#current-overlap-findings).

## Resolved overlaps

- Agent now exports `ContextToolSpec`; Pi and Workflows extend that canonical context-bound contract instead of copying its execute signature.
- Workflows now owns one `createSubagentStream()` adapter; Team and Ralplan retain only skill-specific request, persistence, and validation behavior.
- The Workflows artifact-layout change is planned and is being handled by a concurrent workstream; it is not included in this commit.

## Ownership decision rules

1. A state machine has one owner.
2. A consumer may map data into or out of that state machine, but may not reproduce its transitions.
3. A lower package defines reusable contracts; a higher package supplies host policy and implementations through injection.
4. Similar names are acceptable only when their scope and guarantee are different and documented.
5. Resource loading and static importing are separate APIs; neither permits private source imports.
6. The producer package owns its published artifact layout and manifest paths.
7. A convenience adapter should be shared at the lowest layer where its behavior is genuinely generic, but not moved downward merely to remove a few similar lines.
8. No fallback implementation is added when the canonical owner is unavailable; the operation fails or the dependency is injected.

## Canonical overlap decisions

| Concept | Similar locations | Ownership decision | Allowed consumer behavior | Forbidden duplication |
|---|---|---|---|---|
| Provider registration | AI provider registry; Pi `ModelRegistry.registerProvider` | AI owns API-to-stream dispatch; Pi owns extension configuration/auth/model registration | Pi calls AI registration with a source id | Another provider registry or stream dispatcher in Pi |
| Messages | AI `Message`; Agent `AgentMessage`; Pi session entries | AI owns wire messages; Agent owns custom roles and conversion; Pi owns persistence tree | Pi reconstructs/imports Agent messages; Agent calls `convertToLlm()` | Message conversion or provider transforms in Pi/Workflows |
| Context | AI provider `Context`; Agent `Context`; Pi context hooks/optimizer | Each owns a different stage: wire request, Agent loop snapshot, application policy | Pi supplies Agent transforms; Agent constructs AI Context | Parallel wire-context builder in Pi or workflow code |
| Agent | Agent core; Pi `AgentSession`; workflow proxy Agents; Orchestrator Team | Agent owns the loop; Pi hosts it; Workflows adapts subagent work into Agent streams; Orchestrator only schedules Agents | Construct/configure Agent and call public run APIs | Alternate model/tool loop or Agent lifecycle engine |
| Subagents | Pi manager/backends; generic Agent contracts; Workflow tools | Agent owns the generic Agent loop and tool contracts; Pi owns subagent API, lifecycle specs, concrete execution/store; Workflows owns guarded policy and receipt adaptation | Inject Pi `SubagentManagerApi` into Workflow context | Workflow/Orchestrator manager, process backend, store or lifecycle spec copies |
| Queues | Agent steering queue; Orchestrator `TaskQueue`; workflow persisted task lists | Separate scopes: conversation input, runtime DAG, durable workflow projection | Explicit mapping between workflow task records and Orchestrator tasks | Workflow DAG scheduler or use of Agent queue for tasks |
| Team | Orchestrator `Team`; Workflow Team skill state | Orchestrator owns live roster/message bus; Workflows owns role policy, durable board/events/artifacts | Build Orchestrator Team after workflow admission | Second live Team executor or MessageBus in Workflows |
| Routing | Orchestrator task selection; Workflow expected-next roles; workflow runtime endpoint routing | Orchestrator owns task routing; Workflows owns role policy and control-plane RPC routing | Workflow passes explicit requirements/routes downward | Agent-scoring/scheduling in workflow task mappers |
| Retry | AI/provider request, Agent structured output, Pi assistant turn, Orchestrator task attempt | Intentional scope split | Each layer retries only its owned operation | Workflow retry loop around Orchestrator or merged retry state machines |
| Verification | Orchestrator task callback; Workflow reviewer/prover gates | Orchestrator owns execution verification timing/status; Workflows owns acceptance semantics | Workflow supplies callbacks and interprets evidence | Workflow task state machine in Orchestrator or generic verification engine in Workflows |
| Checkpoints | Orchestrator checkpoint; Workflow checkpoints/state; Pi session history | Orchestrator owns run schema/resume; Workflows owns store and workflow state; Pi owns conversation session history | Workflows implements `OrchestratorCheckpointStore` | Parallel Orchestrator checkpoint schema/resume logic |
| Events | Agent events; TaskQueue events; Workflow events; Pi extension/UI events | Each layer owns its event vocabulary | Explicit adapter maps source event to consumer event | Replacement source dispatcher or copied event schema |
| Receipts | Agent structured/tool receipts; Orchestrator task receipts; Workflow runtime/artifact receipts | Each layer owns its guarantee; higher receipts reference lower ids/metadata | Explicit receipt mapper/reference | Copies of lower receipt schemas in higher layers |
| HUD | TUI HUD model/rendering; Workflow HUD state/policy; Pi composition | TUI owns generic presentation; Workflows owns domain data/persistence; Pi owns provider registration/composition | Workflows returns `HudSummary`; Pi injects reader into TUI | Workflow state in TUI or HUD rendering in Workflows |
| Terminal UI | TUI components/runtime; Pi controllers/dialogs/extension UI | TUI owns reusable mechanics; Pi owns product composition | Pi constructs and adapts components | Raw terminal/render/editor mechanics in Pi |
| Persistence roots | Pi shared root helpers; Pi session paths; workflow layouts | Pi owns shared root helpers; Workflows extends the layout below those roots | Import one canonical encoder/root helper | Multiple session-id/path encoders |

## Current overlap findings

### Resolved packaging boundary

Workflows owns its compiled manifest and package assets. Pi discovers and bundles every workspace package with a valid `pi` manifest, preserves the package-relative `dist/` layout, and rejects unknown `pi:` sources instead of falling back to local-path resolution.

### P1 - consolidate duplicate adapters and contracts

#### 1. Shared session-root ownership and validation are explicit

**Current path:** Pi owns `@tsuuanmi/pi/session/root`, which provides `.pi` roots, path-segment helpers, and the shared `requireSessionId` precondition. Pi also owns its stricter persisted-session syntax validator, `assertPiSessionId`; Workflows extends the layout with workflow-specific paths and state.

**Decision:** Keep one canonical root/encoder implementation in Pi. Workflows may consume the public Pi session-root contract; Agent remains focused on agent behavior and contracts. Pi must not import Workflows.

#### 2. HUD ownership is explicit

- TUI owns `HudSummary` normalization, sanitization, and rendering.
- Workflows owns workflow state, freshness, visibility, and HUD entry production.
- Pi owns generic provider registration, aggregation, error isolation, and status-line composition.
- Pi does not import the Workflows active-state reader.

**Decision:** Keep domain HUD production in Workflows and generic composition in Pi/TUI. Do not add workflow-specific status keys, sentinel messages, or duplicate text-limit rules.

#### 3. Private Workflows aliases stay inside the package

Pi's Jiti extension loader does not provide a `#workflows/*` alias. The compiled Workflows extension resolves private imports through its own package manifest.

**Decision:** Keep private package imports inside their owning package. No package loader alias may point into another package's private source tree.

### P2 - clarify or simplify adjacent ownership

#### 5. Repository-state acquisition is split between Pi and TUI

Pi's footer data provider watches branch metadata, while TUI's status line runs/caches `git status --porcelain` itself.

**Decision:** Prefer Pi-owned repository acquisition/caching with a narrow TUI data provider. TUI should render repository state, not execute Git or own application refresh timers.

#### 6. Keybinding state is both injected and global

TUI owns generic keybinding matching and a mutable global registry. Pi creates the effective manager, retains it and also installs it globally.

**Decision:** TUI owns definitions/matching; Pi owns app bindings and persistence. Prefer explicit host-scoped injection and avoid adding a second registry.

#### 7. Public names hide different scopes

Examples include AI and Agent types both named `Context`, AI and Pi methods both named `registerProvider`, and multiple layers using `Receipt`, `Team`, `Task`, `Event` and `Retry` terminology.

**Decision:** Keep intentionally different contracts, but use qualified imports/aliases and layer-specific public names where ambiguity affects consumers, such as `LlmContext`, `AgentContext`, `registerExtensionProvider`, `TaskExecutionReceipt` and `WorkflowRuntimeReceipt`.

## What is an allowed adapter?

An adapter is valid when it:

- imports or receives the canonical contract;
- translates a higher-layer concern such as configuration, persistence, policy, data shape or UI;
- delegates the core operation to the canonical owner;
- does not create a second registry, queue, state machine, retry loop, renderer or persistence schema with the same guarantee.

Healthy examples in the current tree:

- Pi `ModelRegistry` configures and registers AI providers.
- Pi `ToolManager` adapts Pi/extension specs into Agent `Tool` values.
- Pi's Agent bridge maps Agent events into extension/session events.
- Workflows consumes Pi subagent lifecycle results and adds Workflow receipt metadata.
- Workflows maps `TeamTask` to Orchestrator `TaskInput`.
- Workflows implements `OrchestratorCheckpointStore`.
- Pi maps Workflow active state into TUI HUD input.

## Do-not-duplicate rules

### AI

- No provider-neutral model/message/tool/event protocol outside AI.
- No second provider registry or global `stream()` dispatcher.
- No OAuth algorithm registry in Pi.

### Agent

- No model/tool Agent loop outside Agent.
- No second Tool registry or execution pipeline.
- No copied AgentMessage conversion.
- No second subagent manager, contract, or lifecycle spec set outside Pi.

### Orchestrator

- No workflow-local DAG scheduler, dependency resolver, retry loop or task receipt schema.
- No workflow role/phase policy inside Orchestrator.

### TUI

- No terminal raw-mode/input/render loop in Pi.
- No workflow persistence/visibility policy in TUI.
- No ANSI/component rendering inside Workflows.

### Workflows

- No Agent or Orchestrator engine copies.
- No Pi concrete manager/process/session backend.
- No duplicated role transition tables outside the workflow registry.

### Pi

- No lower-package business logic copied into the composition root.
- No hardcoded workflow registration that bypasses package resources.

## Workflow integration checklist

Use this checklist before moving workflow code to Orchestrator. A missing requirement blocks the move; it does not create a fallback path.

1. Does the workflow need a generic task DAG?
2. Does it assign tasks to a roster of `Agent`s?
3. Are task requirements expressible as `TaskRequirements`?
4. Can workflow state map to/from `TaskSnapshot` without leaking workflow internals?
5. Can workflow storage implement `OrchestratorCheckpointStore` without Orchestrator importing workflow code?
6. Can queue events drive the workflow HUD through a workflow-owned adapter?
7. Are workflow receipts only referencing task receipts instead of duplicating their schema?

If any answer is no, keep the behavior in Workflows until the generic path is clear.

## Do not move into Orchestrator

- Workflow command handlers.
- Workflow HUD state.
- Workflow session/artifact layout.
- Runtime leases or owners.
- Expected-next-role policy.
- Skill-specific gates and verdict wording.
- User-facing artifact names and files.

## ROI-ranked cleanup plan

| Rank | Task | ROI | Exit criteria |
|---:|---|---|---|
| 1 | Make Workflows own one publishable compiled manifest/artifact | Complete | Standalone and Pi-bundled loading use the same package-owned paths; Pi discovers packages without rewriting or duplicating assets |
| 2 | Resolve shared session-root/session-id ownership | Complete | Pi owns one encoder/root contract; Workflows extends it with workflow-relative layout and scoped validation |
| 3 | Reconcile Team dependency and recovery semantics with `TaskQueue` | High | One dependency owner; deterministic blocked states and recovery parity |
| 4 | Remove remaining Ultragoal legacy/dual-write paths | High | One canonical obstacle, quality-gate and receipt write path |
| 5 | Replace HUD magic refresh and duplicate sanitization with explicit host seams | Complete | One HUD normalization policy and generic provider integration; host refresh remains outside workflow state |
| 6 | Complete receipt reference boundaries | Medium-high | Workflows references task/tool ids without copying lower schemas |
| 7 | Prove workflow-owned checkpoint recovery parity | Medium-high | Restart/interrupted recovery is idempotent and independent of workflow state |
| 8 | Normalize cross-layer event documentation and mappings | Medium | Every bridge has one source event and explicit adapter |
| 9 | Move repository-state acquisition out of TUI and reduce global UI state | Medium | TUI receives repository/keybinding/theme state through host-scoped providers |
| 10 | Define approved Ralplan output adapters | Medium-low | Approved plans map to tasks without moving planning policy |
| 11 | Evaluate Ultragoal Orchestrator use only for a real generic DAG | Low-medium | No adapter without independent goals and generic dependencies |
| 12 | Defer shared memory and new delegation APIs | Low | No speculative cross-package state or alternate lifecycle facade |
