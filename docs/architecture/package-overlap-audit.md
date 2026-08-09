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
| Browser profile/worker/provider automation | `@tsuuanmi/pi-web-runtime` | No |
| Named workflow policy/state/artifacts | `@tsuuanmi/pi-workflows` | No |
| CLI/SDK/session/extension application host | `@tsuuanmi/pi` | No |
| Concrete Pi subagent manager and worker backends | Contract in Agent; implementation in Pi | No second implementation found |

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
| Models | AI `Model`; Web Runtime route models; Pi model registry | AI owns generic model shape/catalog; Web Runtime owns browser route truth; Pi owns availability/auth/configuration | Pi maps entitled web routes and settings into AI Models | A second generic model catalog or compatibility engine |
| Provider registration | AI provider registry; Pi `ModelRegistry.registerProvider` | AI owns API-to-stream dispatch; Pi owns extension configuration/auth/model registration | Pi calls AI registration with a source id | Another provider registry or stream dispatcher in Pi |
| Messages | AI `Message`; Agent `AgentMessage`; Pi session entries | AI owns wire messages; Agent owns custom roles and conversion; Pi owns persistence tree | Pi reconstructs/imports Agent messages; Agent calls `convertToLlm()` | Message conversion or provider transforms in Pi/Workflows |
| Context | AI provider `Context`; Agent `Context`; Pi context hooks/optimizer | Each owns a different stage: wire request, Agent loop snapshot, application policy | Pi supplies Agent transforms; Agent constructs AI Context | Parallel wire-context builder in Pi or workflow code |
| Tools | AI tool schema/calls; Agent Tool runtime; Pi/Workflow specs; Web MCP tools | AI owns wire description/validation; Agent owns execution and `ContextToolSpec`; Pi/Workflows own context/render specializations; Web Runtime owns MCP transport | Extend Agent `ToolSpec`/`ContextToolSpec`, adapt to Agent `Tool`, translate selected tools to `WebTool` | Tool execution pipeline, registry, validation or output policy outside Agent |
| Agent | Agent core; Pi `AgentSession`; workflow proxy Agents; Orchestrator Team | Agent owns the loop; Pi hosts it; Workflows adapts subagent work into Agent streams; Orchestrator only schedules Agents | Construct/configure Agent and call public run APIs | Alternate model/tool loop or Agent lifecycle engine |
| Subagents | Agent contract/specs; Pi manager/backends; Workflow tools | Agent owns interface/lifecycle specs; Pi owns concrete execution/store; Workflows owns guarded policy and receipt adaptation | Inject Pi manager structurally into Workflow context | Workflow/Orchestrator manager, process backend, store or lifecycle spec copies |
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
| Browser provider | Web Runtime contracts/automation; Pi account/model/event adapter; AI stream; Agent tools | Web Runtime owns browser mechanics; Pi owns host policy/adaptation; AI owns generic stream; Agent owns tool execution | Pi bridges between contracts | Browser automation in Pi or Agent tool semantics in Web Runtime |
| Persistence roots | Workflows shared root helpers; Pi session paths; workflow layouts | Shared root ownership needs cleanup; each domain still owns its state below the root | Import one canonical encoder/root helper | Multiple session-id/path encoders |

## Current overlap findings

### P0 - fix before relying on the affected boundary

#### 1. Web tool execution bypasses Agent semantics

**Current path:** [`packages/pi/src/runtime/agent-session-factory.ts`](../../packages/pi/src/runtime/agent-session-factory.ts) adapts the selected Agent `Tool` into the web bridge by calling `Tool.prepareArguments()` and `Tool.execute()` directly.

**Overlap:** Agent already owns argument validation, before/after hooks, execution policy, details validation, output limiting, metadata, receipts and tool lifecycle events in [`packages/agent/src/agent/tool-execution.ts`](../../packages/agent/src/agent/tool-execution.ts).

**Decision:** Agent remains the sole tool-execution owner. Before native browser tools are enabled, expose or use an Agent-owned single/external-tool execution seam. Pi may select/authorize the tool and bridge MCP, but must not recreate execution semantics.

**Current mitigating fact:** the bundled ChatGPT automation does not currently invoke MCP tools. The descriptor/event contracts advertise more capability than the end-to-end adapter implements, so public web models must remain limited to the implemented subset.

#### 2. Workflows artifact/manifest ownership is compensated by Pi

**Current path:** Workflows' source manifest points `pi.extensions`, `pi.skills`, `pi.agents` and `pi.commands` at `src/`, while its published `files` contain `dist`, `skills` and `agents`, not `src`. Pi rewrites and flattens the manifest in [`packages/pi/scripts/write-bundled-package-manifests.mjs`](../../packages/pi/scripts/write-bundled-package-manifests.mjs), and Pi's build repeats some Workflow asset copies.

**Overlap:** The producer and host both decide the runtime package layout. A standalone published Workflows package cannot rely on Pi's private rewrite step.

**Decision:** Workflows owns one compiled, publishable manifest and all of its assets. Pi should build/copy that package artifact without rewriting its architecture or recopying source assets. Keep manifest discovery as Pi's loading mechanism; keep `@tsuuanmi/pi-workflows/extension` only as an explicit custom-host API.

### P1 - consolidate duplicate adapters and contracts

#### 3. Shared session-root ownership is inverted and validation is ambiguous

**Current path:** Pi re-exports `piSessionRoot` and `sessionStateDir` from `@tsuuanmi/pi-workflows/session/root`. The current working tree also has a Pi session-id assertion with stricter syntax than Workflows' non-empty assertion.

**Overlap:** Generic Pi-native session identity/path rules live in the higher product workflow layer, and two `assertSessionId` meanings can coexist.

**Decision:** Move the generic `.pi` root, path-segment encoding and shared session-id contract to a genuinely lower shared package, or keep Pi as owner and inject/precompute the root for Workflows without a Workflows-to-Pi import. Workflows should own only paths beneath the shared root. Until moved, Pi and Workflows must import the existing canonical root helpers and must not add another encoder.

#### 4. HUD sanitization and refresh signaling cross ownership

- TUI owns `HudSummary` normalization/sanitization/rendering.
- Workflows owns workflow state, freshness and visibility, but also has local text sanitization.
- `refreshHudUi()` uses a private `__hud_refresh__` extension-status key to trigger Pi redraw.
- Pi directly imports Workflows' active-state reader when constructing the status line.

**Decision:** TUI owns generic HUD normalization/rendering; Workflows owns domain state and produces the canonical HUD value; Pi owns registration/composition and should expose an explicit UI invalidation/provider seam. Do not add more magic status keys or duplicate text-limit rules.

#### 5. Private Workflows aliases participate in Pi runtime loading

Pi's Jiti extension loader maps `#workflows/*` directly into Workflows source or dist so the dynamically loaded extension can resolve its private internal imports.

**Decision:** This is a special packaging bridge, not a public import. Prefer a self-contained compiled extension or package-owned supported runtime entry so Pi does not need a wildcard alias into another package. No other package may use `#workflows/*`.

### P2 - clarify or simplify adjacent ownership

#### 6. Web descriptor capability exceeds the host adapter

Web Runtime route metadata includes image/file input and tool output. Pi currently exposes a text-only AI model, passes no attachments, and cannot translate a native browser tool-call round trip.

**Decision:** Web Runtime owns factual provider capability; Pi owns and must expose only the implemented subset. Add attachment conversion in Pi and connector/MCP behavior in Web Runtime before advertising those capabilities through Pi.

The public Web Runtime root also does not export the internal `startWorker()` helper used by the bundled provider. Descriptor discovery is public, but a turnkey external worker bootstrap is incomplete. Third-party providers must not deep-import that helper.

#### 7. Repository-state acquisition is split between Pi and TUI

Pi's footer data provider watches branch metadata, while TUI's status line runs/caches `git status --porcelain` itself.

**Decision:** Prefer Pi-owned repository acquisition/caching with a narrow TUI data provider. TUI should render repository state, not execute Git or own application refresh timers.

#### 8. Keybinding state is both injected and global

TUI owns generic keybinding matching and a mutable global registry. Pi creates the effective manager, retains it and also installs it globally.

**Decision:** TUI owns definitions/matching; Pi owns app bindings and persistence. Prefer explicit host-scoped injection and avoid adding a second registry.

#### 9. Public names hide different scopes

Examples include AI and Agent types both named `Context`, AI and Pi methods both named `registerProvider`, and multiple layers using `Receipt`, `Team`, `Task`, `Event` and `Retry` terminology.

**Decision:** Keep intentionally different contracts, but use qualified imports/aliases and layer-specific public names where ambiguity affects consumers, such as `LlmContext`, `AgentContext`, `registerExtensionProvider`, `TaskExecutionReceipt` and `WorkflowRuntimeReceipt`.

#### 10. Web worker and entitlement state have different lifetimes

Pi holds one process-global worker pool. Resource reload/session replacement closes all workers, while browser credentials persist and entitlement state is cleared on descriptor reload.

**Decision:** Web Runtime continues to own worker primitives; Pi owns pool scope, account activation and entitlement policy. Define whether persisted active accounts are reverified after reload and scope worker lifetime explicitly before supporting concurrent sessions.

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
- Workflows adapts Agent subagent lifecycle specs and adds Workflow receipt metadata.
- Workflows maps `TeamTask` to Orchestrator `TaskInput`.
- Workflows implements `OrchestratorCheckpointStore`.
- Pi maps Web Runtime route/event contracts to AI model/event contracts.
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
- No second SubagentManager contract or lifecycle spec set.

### Orchestrator

- No workflow-local DAG scheduler, dependency resolver, retry loop or task receipt schema.
- No workflow role/phase policy inside Orchestrator.

### TUI

- No terminal raw-mode/input/render loop in Pi.
- No workflow persistence/visibility policy in TUI.
- No ANSI/component rendering inside Workflows.

### Web Runtime

- No Playwright profile/session/worker/MCP transport in Pi.
- No Pi accounts/auth/model availability inside Web Runtime.
- No Agent tool execution semantics in the web bridge.

### Workflows

- No Agent or Orchestrator engine copies.
- No Pi concrete manager/process/session backend.
- No duplicated role transition tables outside the workflow registry.

### Pi

- No lower-package business logic copied into the composition root.
- No hardcoded workflow registration that bypasses package resources.
- No browser provider implementation in the host adapter.

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
| 1 | Route browser tool execution through Agent semantics before enabling native tools | Critical | One Agent-owned execution path preserves validation, hooks, policy, limits, details, receipts and events |
| 2 | Make Workflows own one publishable compiled manifest/artifact | Critical | Standalone and Pi-bundled loading use the same package-owned paths; Pi no longer rewrites or duplicates assets |
| 3 | Resolve shared session-root/session-id ownership | High | One encoder/root contract and unambiguous validation; Workflows owns only workflow-relative layout |
| 4 | Reconcile Team dependency and recovery semantics with `TaskQueue` | High | One dependency owner; deterministic blocked states and recovery parity |
| 5 | Remove remaining Ultragoal legacy/dual-write paths | High | One canonical obstacle, quality-gate and receipt write path |
| 6 | Replace HUD magic refresh and duplicate sanitization with explicit host seams | Medium-high | One HUD normalization policy and explicit provider/invalidation integration |
| 7 | Complete receipt reference boundaries | Medium-high | Workflows references task/tool ids without copying lower schemas |
| 8 | Prove workflow-owned checkpoint recovery parity | Medium-high | Restart/interrupted recovery is idempotent and independent of workflow state |
| 9 | Normalize cross-layer event documentation and mappings | Medium | Every bridge has one source event and explicit adapter |
| 10 | Move repository-state acquisition out of TUI and reduce global UI state | Medium | TUI receives repository/keybinding/theme state through host-scoped providers |
| 11 | Align advertised Web capabilities with implemented conversion/transport | Medium | Model input/output metadata matches actual attachment/tool behavior |
| 12 | Define approved Ralplan output adapters | Medium-low | Approved plans map to tasks without moving planning policy |
| 13 | Evaluate Ultragoal Orchestrator use only for a real generic DAG | Low-medium | No adapter without independent goals and generic dependencies |
| 14 | Defer shared memory and new delegation APIs | Low | No speculative cross-package state or alternate lifecycle facade |
