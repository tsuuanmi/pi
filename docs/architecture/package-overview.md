# Package Overview

This page is the current source-level map of the packages under `packages/`. It covers every package directory with a `package.json` and excludes `dist/`, `node_modules/`, tests, and package-local documentation. It is an inventory and interaction guide; [`package-boundaries.md`](./package-boundaries.md) remains the detailed record of core execution-boundary rules.

The dependency graph below describes internal runtime package dependencies declared by the manifests. An arrow `A -> B` means that `A` depends on the published boundary of `B`; development-only dependencies are omitted.

## Dependency map

```text
@tsuuanmi/pi
├── @tsuuanmi/pi-agent
│   └── @tsuuanmi/pi-ai
├── @tsuuanmi/pi-ai
├── @tsuuanmi/pi-tui
├── @tsuuanmi/pi-workflows
│   ├── @tsuuanmi/pi-agent
│   ├── @tsuuanmi/pi-ai
│   ├── @tsuuanmi/pi-orchestrator
│   │   └── @tsuuanmi/pi-agent
│   └── @tsuuanmi/pi-tui
└── @tsuuanmi/pi-web-runtime

@tsuuanmi/pi-ai       (leaf)
@tsuuanmi/pi-tui      (leaf)
@tsuuanmi/pi-web-runtime (leaf)
```

The important architectural property is that `@tsuuanmi/pi` is the application host, while the lower packages remain reusable. `@tsuuanmi/pi-workflows` is loaded by the host as an extension package; it does not import `@tsuuanmi/pi`. `@tsuuanmi/pi-web-runtime` is also host-neutral; Pi maps its browser/provider events into the Pi model and agent runtime.

## Package inventory and boundaries

| Package | Boundary and primary responsibility | Does not own | Runtime dependencies |
| --- | --- | --- | --- |
| [`@tsuuanmi/pi-ai`](../../packages/ai/README.md) | Model definitions, provider registration, provider transports, message/context/tool protocols, and assistant event streams | Agent loops, tool execution, orchestration, sessions, CLI, TUI, and browser profile management | None of the internal packages |
| [`@tsuuanmi/pi-agent`](../../packages/agent/README.md) | One-agent execution, message state and compaction, tool contracts/registry/policy, tool receipts, and host-neutral subagent lifecycle contracts | Pi sessions and tmux, Pi-specific tools/output, multi-agent scheduling, workflow state, and UI | `@tsuuanmi/pi-ai` |
| [`@tsuuanmi/pi-orchestrator`](../../packages/orchestrator/README.md) | Generic task/team execution over `Agent` instances: planning, routing, scheduling, retries, checkpoints, metrics, and task receipts | Pi workflow commands and gates, concrete subagent process control, CLI/session state, and workflow artifacts | `@tsuuanmi/pi-agent` |
| [`@tsuuanmi/pi-workflows`](../../packages/workflows/README.md) | User-facing workflow skills and commands, workflow state/audit/artifacts, workflow policies, and adapters for agent and orchestrator contracts | The Pi application API, the low-level agent loop, provider transport, and generic orchestrator internals | `@tsuuanmi/pi-agent`, `@tsuuanmi/pi-ai`, `@tsuuanmi/pi-orchestrator`, `@tsuuanmi/pi-tui` |
| [`@tsuuanmi/pi`](../../packages/pi/README.md) | CLI/application host, resource and extension loading, auth/settings, model registry, session persistence, built-in tools, concrete subagent sessions, web-provider adapters, and TUI integration | Reusable agent/provider/orchestrator internals, workflow business logic, and browser-provider internals | `@tsuuanmi/pi-agent`, `@tsuuanmi/pi-ai`, `@tsuuanmi/pi-tui`, `@tsuuanmi/pi-workflows`, `@tsuuanmi/pi-web-runtime` |
| [`@tsuuanmi/pi-tui`](../../packages/tui/README.md) | Terminal rendering, differential updates, components, input/editor behavior, overlays, themes, and terminal utilities | Pi sessions, agent state, workflow state, model/provider logic, and browser automation | None of the internal packages |
| [`@tsuuanmi/pi-web-runtime`](../../packages/web-runtime/README.md) | Host-neutral browser sessions, Chromium/profile workers, MCP bridge, web-provider descriptors, and the ChatGPT web provider implementation | Pi auth/account policy, model registry, agent/tool contracts, session persistence, and terminal UI | None of the internal packages |

## How the packages interact

### 1. Application startup and resource loading

`@tsuuanmi/pi` owns the host lifecycle. Its resource loader reads package manifests and resolves extensions, skills, agents, commands, themes, and web-provider descriptors. The two bundled default packages are:

- `@tsuuanmi/pi-workflows`, which contributes an extension, workflow skills, agent definitions, and workflow commands.
- `@tsuuanmi/pi-web-runtime`, which contributes web-provider descriptor modules through `pi.webProviders`.

The workflow package exposes a host-neutral factory from `packages/workflows/src/extension.ts`. Pi supplies a host implementing the workflow tool and hook interfaces, so the workflow package can register behavior without importing Pi internals.

### 2. Standard agent turn

```text
Pi session/runtime
      │ creates and hosts
      ▼
@tsuuanmi/pi-agent
      │ receives a stream function from the host
      ▼
@tsuuanmi/pi-ai ──> selected model provider ──> assistant event stream
      ▲                                                   │
      └──────── tool calls/results and next-turn context ┘

Pi session persistence and @tsuuanmi/pi-tui render the resulting events.
```

`@tsuuanmi/pi-agent` owns the loop and tool protocol. `@tsuuanmi/pi-ai` owns model/provider transport. `@tsuuanmi/pi` supplies concrete tools, session services, authentication/model selection, and the stream function, then persists and presents the result.

### 3. Workflow and team execution

```text
User command or skill
        │
        ▼
Pi resource/extension host
        │ loads and invokes
        ▼
@tsuuanmi/pi-workflows
   ├── workflow tools, hooks, state, gates, and receipts
   ├── @tsuuanmi/pi-agent adapters and subagent-manager contract
   └── @tsuuanmi/pi-orchestrator
          └── plans, routes, schedules, retries, and checkpoints Agent instances
        │
        ▼
Pi session state, artifacts, receipts, and TUI output
```

The `SubagentManager` contract is the lifecycle seam: `@tsuuanmi/pi-agent` defines the host-neutral contract, `@tsuuanmi/pi` supplies concrete Pi-native sessions, and workflow tools invoke it through explicit adapters. The orchestrator receives `Agent` instances and coordinates task execution; it does not spawn Pi sessions or own workflow state.

### 4. Browser-backed web models

```text
Pi resource loader
      │ loads descriptor from
      ▼
@tsuuanmi/pi-web-runtime
      │ descriptor + worker + browser/MCP execution
      ▼
Pi WebProviderHost / ProfileWorkerPool
      │ auth, entitlement, model registration, and tool adapter
      ▼
@tsuuanmi/pi-ai model with api = "web"
      │
      ▼
@tsuuanmi/pi-agent through Pi's stream function
```

`@tsuuanmi/pi-web-runtime` uses its own provider and turn-event contracts so it remains independent of Pi's model and agent packages. Pi verifies browser accounts and entitlements, exposes entitled routes as models, converts web turn events to the `@tsuuanmi/pi-ai` event stream, and routes browser MCP tool calls back to Pi's tool executor.

### 5. Terminal presentation

`@tsuuanmi/pi-tui` is a presentation leaf. Pi composes its components and rendering primitives into the interactive CLI. Workflow HUDs may use the same published TUI primitives, but TUI does not know about workflows, sessions, or agents. This keeps terminal rendering reusable and prevents UI concerns from flowing into the execution packages.

## Boundary rules to preserve

- Keep model/provider transport in `@tsuuanmi/pi-ai`; adapt new provider types at the host boundary instead of adding Pi-specific state to AI protocols.
- Keep one-agent execution and standard tool contracts in `@tsuuanmi/pi-agent`; keep concrete process/session control in `@tsuuanmi/pi`.
- Use `@tsuuanmi/pi-orchestrator` for generic multi-agent task coordination. Workflow-specific gates, artifacts, and state remain in `@tsuuanmi/pi-workflows`.
- Load workflows through the Pi extension/resource host. `@tsuuanmi/pi-workflows` must not import `@tsuuanmi/pi` or `@tsuuanmi/pi/*`.
- Keep browser automation and MCP transport in `@tsuuanmi/pi-web-runtime`; keep Pi authentication, entitlement, model registration, and event adaptation in `@tsuuanmi/pi`.
- Keep terminal rendering in `@tsuuanmi/pi-tui`; lower execution packages must not depend on it.

## Source anchors and detailed references

The main integration seams are:

- [`packages/pi/src/loader/resources.ts`](../../packages/pi/src/loader/resources.ts) and [`packages/pi/src/loader/extensions/loader.ts`](../../packages/pi/src/loader/extensions/loader.ts) for package resource and extension loading.
- [`packages/pi/src/runtime/agent-session-factory.ts`](../../packages/pi/src/runtime/agent-session-factory.ts) for host wiring of agents, models, tools, and web providers.
- [`packages/workflows/src/extension.ts`](../../packages/workflows/src/extension.ts) for the workflow extension boundary.
- [`packages/pi/src/web-providers/host.ts`](../../packages/pi/src/web-providers/host.ts) for web-provider descriptor loading and host ownership.
- [`package-boundaries.md`](./package-boundaries.md), [`persistence-boundaries.md`](./persistence-boundaries.md), and [`workflow-orchestrator-overlap.md`](./workflow-orchestrator-overlap.md) for detailed boundary and state decisions.
