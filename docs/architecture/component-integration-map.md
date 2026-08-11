# Component Integration Map

This document answers two separate questions for every workspace package:

1. **Where is the canonical component implemented?**
2. **How does another package consume it?**

See [Package Overlap Audit](package-overlap-audit.md) for duplicate/ambiguous implementations and [Package Boundaries](package-boundaries.md) for allowed dependency direction.

## Consumption vocabulary

Pi uses five integration mechanisms. They are not interchangeable.

| Mechanism | Meaning | Example |
|---|---|---|
| Static package import | Compile-time/runtime ESM import through a published package root or subpath | Workflows imports `Orchestrator` from `@tsuuanmi/pi-orchestrator` |
| Dynamic resource load | Pi discovers a file through a package `pi` manifest and loads it at runtime | Pi loads Workflows' extension with Jiti |
| Dependency injection | A lower package defines a contract; a higher package supplies an implementation or callback | Pi supplies generic session services; Orchestrator supplies `SubagentManagerApi`; Workflows injects workflow policy |
| Data handoff | One package writes or returns an owned schema; another reads/maps it without taking ownership | Workflows writes active state; Pi maps it to TUI HUD input |
| Build-time bundling | Pi copies another package's compiled artifact into the CLI distribution | Pi bundles Workflows under `dist/packages/` |

Build-time bundling does not make package internals public. Dynamic loading does not authorize source deep imports. Dependency injection does not transfer ownership of the interface to the implementation package.

## All-package access summary

| Provider package | Static workspace consumers | Runtime-loaded by Pi | Primary injected/data seam |
|---|---|---|---|
| `@tsuuanmi/pi-ai` | Agent, Workflows, Pi | No | `StreamFunction`, provider registry, normalized events |
| `@tsuuanmi/pi-agent` | Orchestrator, Workflows, Pi | No | `AgentOptions`, `ToolSpec`, `Model`, `ThinkingLevel` |
| `@tsuuanmi/pi-orchestrator` | Workflows | Yes: hidden worker command | Agents, public Pi session services, hooks, checkpoint stores |
| `@tsuuanmi/pi-tui` | Workflows, Pi | Theme assets are loaded by Pi, not the package module | Components, data providers, editor/theme contracts |
| `@tsuuanmi/pi-workflows` | Pi | Yes: extension, skills, agents, command | Structural workflow host, public Orchestrator `SubagentManagerApi`, active-state handoff |
| `@tsuuanmi/pi` | Orchestrator, Workflows | It is the core host | Public session services, SDK, and extension contracts |

## AI components

Canonical source: [`packages/ai/src/`](../../packages/ai/src). Public access: `@tsuuanmi/pi-ai` and the declared provider/OAuth subpaths.

| Canonical component | Consumers and access | How it is used | Consumer-owned adapter | Must not be duplicated |
|---|---|---|---|---|
| `Model`, model catalog, compatibility and cost helpers | Agent, Workflows, Pi import `@tsuuanmi/pi-ai` | Agent runs a selected model; Workflows constructs role adapters; Pi merges settings/auth/availability | Pi `ModelRegistry` adds application configuration and user-facing availability | Model shape, built-in catalog, compatibility merge, or equality rules |
| Wire `Message`, `Context`, tool-call and usage protocol | Agent, Workflows, Pi import root | Provider-neutral request/response values | Agent converts `AgentMessage` to AI messages; Pi maps application data to AI values | Provider wire protocol or provider transforms |
| Provider registry and `stream()` | Pi imports the registry/stream APIs; Agent imports protocol types and receives an injected `StreamFunction` | Pi resolves `model.api` through AI's registry; Agent invokes the host-supplied stream function | Pi registers extension streams and supplies auth/options | A second API-to-stream registry or dispatch path |
| `AssistantMessageEventStream` | Agent, Workflows, Pi import root | One normalized streaming contract | Workflows wraps subagent output; Pi adapts provider streams | Another event queue/final-message protocol |
| Tool schema validation | Agent imports root | Validates model-produced tool arguments before execution | None; higher packages supply Tool implementations only | JSON-schema validation/coercion in Pi or Workflows |
| OAuth algorithms and registry | Pi imports `@tsuuanmi/pi-ai/oauth` | Login, refresh, PKCE/device-code, provider token derivation | Pi owns account UI, auth storage, locking, and active-account policy | OAuth protocol logic or OAuth-provider registry in Pi |

### AI load behavior

AI's built-in provider modules are registered lazily inside the AI package. This is internal lazy loading, not Pi package-resource loading. Consumers call the public provider/stream APIs and do not import AI source files.

## Agent components

Canonical source: [`packages/agent/src/`](../../packages/agent/src). Public access: `@tsuuanmi/pi-agent` and `@tsuuanmi/pi-agent/node`.

| Canonical component | Consumers and access | How it is used | Consumer-owned adapter | Must not be duplicated |
|---|---|---|---|---|
| `Agent` and the model/tool turn loop | Orchestrator, Workflows, Pi import root | Pi constructs the primary session Agent; Orchestrator holds/runs Agents; Workflows creates proxy Agents backed by subagents | Pi supplies stream/auth/context/tool configuration; Workflows supplies manager-backed stream adapters | Model loop, tool-call continuation, steering/follow-up lifecycle, loop detection, or Agent state engine |
| `AgentMessage` and `convertToLlm()` | Pi imports root | Session entries and custom roles are converted before provider calls | Pi persists/reconstructs messages and supplies context hooks | Agent-message-to-AI conversion or custom-role formatting |
| `ToolSpec`, `ContextToolSpec`, `Tool`, `ToolRegistry`, tool results and updates | Workflows and Pi import root | Workflows specializes `ContextToolSpec` with workflow context; Pi specializes it with extension context/renderers and adapts declarations to `Tool` | Context/render metadata in the consuming package | Tool registry, validation/execution ordering, output limiting, or result-message creation |
| Agent events/hooks/traces | Pi imports root; Workflows uses selected contracts | Pi bridges Agent lifecycle to extension/session events | Pi's event bridge maps but does not redefine source semantics | Another Agent dispatcher or hook pipeline |
| Structured/tool/subagent receipt envelope | Orchestrator, Workflows, Pi import root | Lower-layer provenance is referenced or rendered | Orchestrator and Workflows add their own layer-specific receipt schemas | Copies of Agent receipt schemas in higher layers |
| Session-aware subagent manager, records, and lifecycle tool specs | Orchestrator owns and exports the public API; Workflows composes it | Workflows invokes `SubagentManagerApi`; Orchestrator implements manager and tools over public Pi session services | Orchestrator owns records, isolated sessions, native/tmux backends, persistence, and lifecycle execution; Workflows adds policy | A second manager, process backend, live-run map, durable subagent store, or lifecycle spec set |
| Node process/path/JSONL/mutation utilities | Workflows and Pi import `/node` | Shared process/path/storage primitives | Application-specific output/policy remains in Pi; workflow file layout remains in Workflows | Copies of generic process termination, Bash resolution, path canonicalization, or file mutation queue |

### Direct Agent use

```text
Pi
  -> import { Agent } from "@tsuuanmi/pi-agent"
  -> new Agent({ stream, getApiKey, tools, hooks, context transforms, ... })
  -> AgentSession hosts the Agent and persists its events

Workflows
  -> import { Agent } from "@tsuuanmi/pi-agent"
  -> consume { SubagentManagerApi } from "@tsuuanmi/pi-orchestrator"
  -> create an Agent whose StreamFunction delegates one admitted role/task to the orchestrator manager
  -> pass that Agent to Orchestrator

Orchestrator
  -> import Agent from "@tsuuanmi/pi-agent"
  -> select an existing Agent and call Agent.run(taskPrompt)
```

Neither Workflows nor Orchestrator may implement a replacement Agent loop. A proxy `StreamFunction` is an adapter only if it still runs through the canonical `Agent` lifecycle.

## Orchestrator components

Canonical source: [`packages/orchestrator/src/`](../../packages/orchestrator/src). Public access: `@tsuuanmi/pi-orchestrator`. Workflows is the only workspace consumer.

| Canonical component | Workflows use | Workflow-owned adapter | Must not be duplicated |
|---|---|---|---|
| `Task`, `TaskQueue`, DAG readiness/status | Maps durable `TeamTask` values to `TaskInput`, then reads `TaskSnapshot` | Task mapper and persisted workflow projection | DAG validator, ready queue, dependency resolver, or task status engine |
| `Team` and `MessageBus` | Builds the runtime Agent roster | Workflow role/profile selection before construction | Second runtime Team executor or live MessageBus |
| Scheduler, selector and routing | Routes ready tasks to eligible Agents | Explicit workflow route/requirements input | Agent scoring, task scheduler, or fallback routing in Workflows |
| Task execution, retry, budgets and verification callback timing | Runs Team and one-stage Ralplan work | Workflow-specific evidence/role gates inside injected callbacks | Task retry loop, task state transitions, or generic verification lifecycle |
| `OrchestratorCheckpoint` and resume semantics | Workflows implements `OrchestratorCheckpointStore` | Session-scoped filesystem store | Checkpoint schema, task reset, identity validation, or resume engine |
| `TaskExecutionReceipt` and queue events | Workflows maps them to references and durable workflow events | Explicit event/receipt mappers | Copies of task receipt or queue event schemas |

Pi does not import Orchestrator directly. Product-specific use is admitted and adapted by Workflows.

## TUI components

Canonical source: [`packages/tui/src/`](../../packages/tui/src). Public access: root `@tsuuanmi/pi-tui`.

| Canonical component | Consumers and access | Consumer-owned composition | Must not be duplicated |
|---|---|---|---|
| `Terminal`, `ProcessTerminal`, `TUI`, render/focus/overlay loop | Pi imports root | Pi constructs the interactive application and controls lifecycle | Raw mode, keyboard protocol, frame diff, cursor, or terminal render loop |
| `Component`, `EditorComponent`, input/editor primitives | Pi imports root | Pi builds application dialogs/controllers and exposes selected types to extensions | Text editing, focus, autocomplete, or overlay mechanics in Pi |
| Theme types, parsing and rendering projections | Pi imports root | Pi discovers theme files and persists the selected theme | Theme parser/schema or component color projections |
| Generic keybinding definitions/matching | Pi imports root | Pi creates one manager per UI host, adds application actions, loads settings and injects the manager into interactive components | A mutable active-manager singleton, fallback manager or second matcher |
| `HudSummary`, normalization and rendering | Workflows registers a generic provider; Pi/TUI import root | Workflows produces domain HUD data; Pi composes the status area and TUI renders it | Workflow state/persistence in TUI or ANSI HUD rendering in Workflows |
| Status-line provider contracts | Pi imports root | Pi acquires/caches repository state and supplies session/footer/HUD snapshots | Git processes, repository watchers/pollers, or session/model/provider logic inside TUI |

TUI receives data through structural providers and callbacks. It must not import Pi or Workflows.

## Workflows components

Canonical source: [`packages/workflows/src/`](../../packages/workflows/src). Static access uses declared `@tsuuanmi/pi-workflows` exports. Runtime resources use the package `pi` manifest.

| Canonical component | Pi access | How Pi uses it | Must not be duplicated |
|---|---|---|---|
| Active workflow state | Workflows registers a generic HUD provider through its extension | Pi aggregates provider entries into the interactive status line | Workflow visibility/freshness/state rules in Pi or TUI |
| Extension composition | `pi.extensions` manifest resource; Jiti loads default factory | Injects structural host with `registerTool` and `on` | Hardcoded workflow tool/hook registration in Pi |
| Skills | `pi.skills` Markdown/resource discovery | Loads Deep Interview, Ralplan, Team and Ultragoal instructions/assets | Skill policy or transitions in Pi |
| Agent profiles | `pi.agents` Markdown/resource discovery | Loads workflow role profiles into Pi's agent registry | Duplicate role definitions in Pi |
| `pi workflow` command | `pi.commands` resource; native dynamic import by path | Dispatches package-owned CLI command before normal session mode | Workflow command parser/handler in Pi |
| Workflow tools/hooks | Extension host injection | Registers workflow-owned ToolSpecs and lifecycle hooks | Copies of tool definitions in Pi |
| Workflow state/artifacts/audit/receipts | Data handoff through explicit session paths | Pi shows state/results but does not mutate schemas directly | Workflow persistence or transaction logic in Pi/Orchestrator |
| Shared subagent stream adapter | Public Orchestrator `src/subagents/stream.ts` using Agent/AI contracts | Team and Ralplan supply skill-specific subagent operations | Duplicate assistant event/message envelopes in workflow adapters |
| Orchestrator adapters | Internal Workflows components using public Orchestrator/Agent imports | Workflows resolves `SubagentManagerApi` from Pi session services through Orchestrator | Workflow-specific adapters in Pi or generic orchestration in Workflows |

### Workflows load flow

```text
pi:workflows source
  -> package manager resolves bundled package root
  -> package loader reads package.json pi fields
  -> extensions: Jiti imports the default extension factory
  -> skills/agents: resource loader reads Markdown and adjacent assets
  -> commands: startup dispatcher imports the selected command module
  -> host injection supplies ExtensionAPI and generic Pi session services; Workflows installs and resolves the concrete Orchestrator SubagentManager through public exports
```

The `/extension` public export is a custom-host API. Pi's normal runtime identity is the manifest resource path, not a hardcoded static import of that subpath.

## Pi components

Canonical source: [`packages/pi/src/`](../../packages/pi/src). Workflow packages may consume Pi's public host/session contracts; Pi source does not import workflow implementation code.

| Canonical component | Consumer | Access | Must not be duplicated below Pi |
|---|---|---|---|
| `.pi` roots and base session layout | Workflow paths, session services/runtime, CLI modes, and SDK users | `@tsuuanmi/pi/session/root` | A second root/encoder or workflow policy in Pi |
| `AgentSession`, session services/runtime | CLI modes and external SDK users | Internal composition or `@tsuuanmi/pi` SDK | Session persistence, prompt/compaction/retry coordination |
| `DefaultResourceLoader` and package manager | Pi startup and external SDK users | Internal use or public loader APIs | Package discovery, filtering, diagnostics, or bundled-source policy in lower packages |
| Extension API/runner/UI context | Dynamically loaded extensions | Pi injects a host object; extensions register capabilities | Extension lifecycle/event bus/application UI in Workflows/TUI |
| Concrete `SubagentManager` | Workflows through Orchestrator's public package boundary | Public `SubagentManagerApi` plus Pi's generic `AgentSessionServices` host contract | Isolated Pi sessions, worker/tmux execution, durable records |
| Model/auth configuration | Agent stream callback and UI | Pi `ModelRegistry`/auth storage over AI APIs | Credential storage or user availability policy in AI/Agent |
| Coding tools and renderers | Agent and interactive UI | Pi adapts `PiToolSpec`/extension specs to Agent `Tool` | Agent's generic tool execution engine |

External code imports Pi's documented root, `/extensions`, `/loader`, `/loader/config`, or `/session/root` surfaces. Workspace packages communicate upward only through callbacks, structural host objects, and data values.

## Adapter versus duplicate logic

A higher-layer adapter is allowed only when all of these are true:

1. The lower package owns the source contract and state machine.
2. The adapter imports that public contract or receives it through injection.
3. The adapter translates configuration, data shape, persistence, or UI concerns owned by the consumer.
4. The adapter delegates execution to the lower package instead of reproducing its algorithm.
5. Removing the lower package would make the adapter unable to perform the core operation.

Examples of valid adapters:

- Pi `ModelRegistry` configures AI providers but does not dispatch streams itself.
- Pi `ToolManager` converts host specs to Agent `Tool` values but Agent executes them.
- Workflows maps `TeamTask` to Orchestrator `TaskInput` but Orchestrator schedules it.
- Workflows implements `OrchestratorCheckpointStore` but does not define checkpoint semantics.
- Pi maps workflow active state to TUI HUD input but Workflows owns state and TUI renders it.

A duplicate is present or being introduced when a consumer adds a second registry, queue, state machine, retry loop, schema with the same guarantee, process backend, renderer, or persistence format already owned below it.

## Import and load rules

- Use only package roots/subpaths declared by the provider package.
- Never import another package's `src/`, private `dist/` path, or `#package/*` alias.
- Resource files named by `package.json` `pi` fields are loadable assets, not general code APIs.
- A dynamic extension receives Pi capabilities through its host object; it must not import Pi internals.
- Keep one runtime loading identity for each resource. Public programmatic exports may coexist only when their custom-host purpose is explicit.
- The package that publishes a resource owns its compiled layout and manifest paths. Pi should discover and copy artifacts, not rewrite another package's architecture.
- Keep event, receipt, checkpoint, model and message conversions in explicit adapter files so ownership is visible in source. See [Event Boundaries](event-boundaries.md) and [Receipt Boundaries](receipt-boundaries.md).
