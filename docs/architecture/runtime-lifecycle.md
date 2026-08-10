# Runtime Lifecycle

This page describes the cross-package lifecycle of a Pi run. It focuses on ownership and hand-offs; package-local references contain the API details.

## Lifecycle at a glance

```text
CLI entry point
    |
    v
bootstrap and startup commands
    |
    v
parse arguments and select mode
    |
    v
select or create session
    |
    v
create cwd-bound runtime services
    |-- settings and auth
    |-- package/resource loader
    |-- model registry
    |-- extension host
    `-- agent-session services
    |
    v
create AgentSession
    |-- @tsuuanmi/pi-agent Agent
    |-- Pi tools and extension tools
    |-- model/stream adapter
    `-- session persistence and event forwarding
    |
    v
interactive | print | JSON | RPC mode
    |
    v
shutdown, session switch, or reload
```

The application package, `@tsuuanmi/pi`, owns this lifecycle. The lower packages provide reusable services and contracts:

- `@tsuuanmi/pi-ai` provides model and provider streaming.
- `@tsuuanmi/pi-agent` runs the agent loop and tool protocol.
- `@tsuuanmi/pi-workflows` contributes host-loaded workflow behavior.
- `@tsuuanmi/pi-tui` renders interactive output.

## Startup phases

### 1. Bootstrap the process

`packages/pi/src/main.ts` calls `bootstrapStartup()` first. This resolves the working directory and agent directory, applies HTTP proxy settings, and configures the HTTP dispatcher.

Startup commands are handled before a session is created. This covers package/configuration commands and worker entry points that must not enter the normal agent runtime.

### 2. Parse arguments and choose a mode

Pi parses arguments, reports argument diagnostics, handles version/help/list-model requests, and resolves one of these modes:

| Mode | Runtime behavior |
| --- | --- |
| Interactive | TUI input, streaming output, slash commands, and session navigation |
| Print | One non-interactive text response |
| JSON | One non-interactive structured response |
| RPC | Bidirectional JSON-RPC over stdio |

The mode determines input and output handling, not the underlying agent/session implementation.

### 3. Select the effective session

Pi creates a startup settings manager and resolves the selected, resumed, or new session before creating project-bound runtime services. A session may point at a different working directory than the process startup directory, so the effective session directory must be known before loading project resources, settings, models, and extensions.

`SessionManager` owns the session log and selection/branching operations. It does not own model inference or terminal rendering.

### 4. Create runtime services

`createAppRuntime()` creates the services for the effective session working directory. `createAgentSessionServices()` assembles:

- settings resolution;
- authentication storage;
- package and resource loading;
- model/provider registration;
- extension loading and diagnostics; and
- the dependencies needed to construct an `AgentSession`.

Resource and extension failures are collected as diagnostics. Invalid optional resources can be reported while other resources continue to load; fatal diagnostics stop the run before mode execution.

### 5. Load packages and resources

The resource loader resolves project, user, built-in, and package resources. Package manifests under the `pi` key can contribute extensions, skills, prompts, themes, commands, and agent profiles.

The default workflow package is loaded as an extension/resource package.

See [Package and Extension Authoring](./package-and-extension-authoring.md) for the manifest and host contracts.

### 6. Construct the agent session

The runtime creates an `AgentSession` from the services and selected session manager. The session wires together:

- an `@tsuuanmi/pi-agent` `Agent` and its in-memory state;
- Pi-native tools and extension/workflow tools;
- the selected model and thinking level;
- the model stream function;
- extension hooks and the host event bus; and
- session persistence and diagnostics.

The stream function is a host seam. Models are routed to `@tsuuanmi/pi-ai`, which provides the normalized event-stream contract.

## Turn lifecycle

```text
input from mode
    |
    v
AgentSession prompt/send
    |
    v
@tsuuanmi/pi-agent Agent loop
    |                         ^
    | stream function          | tool results / follow-ups
    v                         |
@tsuuanmi/pi-ai event stream  +-- Pi or extension tool execution
    |
    v
Agent events -> session log, hooks, mode output, and TUI
```

1. A mode submits user input to `AgentSession`.
2. The session passes the request to the host-neutral agent loop.
3. The host stream function invokes the selected provider.
4. Assistant events are forwarded to the agent and host event system.
5. Tool calls are resolved through the active tool registry. Pi, extensions, and workflows own their respective tool implementations; the agent package owns the tool contract and execution lifecycle.
6. Tool results are added to the next context and the agent loop continues until completion, abort, or error.
7. Session entries and relevant lifecycle events are persisted while the active mode renders or serializes the output.

`@tsuuanmi/pi-ai` does not know about sessions or the TUI. `@tsuuanmi/pi-agent` does not know which Pi mode is presenting its events.

## Workflow insertion points

### Workflows

The resource loader discovers the workflow package's extension, skills, agent profiles, and commands. The extension registers tools and hooks against the host supplied by Pi. Workflow tools can use Pi's published `SubagentManagerApi` and the task/team primitives from `@tsuuanmi/pi-orchestrator`.

Pi supplies concrete subagent sessions and session services. Workflow state, gates, artifacts, and workflow receipts remain owned by `@tsuuanmi/pi-workflows`.

## Mode and shutdown behavior

All four modes share the same `AgentSession` core:

- Interactive mode adds TUI input, streaming presentation, commands, and navigation.
- Print and JSON modes submit finite input and restore stdout after completion.
- RPC mode keeps the session alive behind a JSON-RPC transport.

Session switching, reload, and shutdown must invalidate the old session-bound extension context before a replacement context is used. Runtime services are recreated when the effective session working directory changes. Cleanup closes mode resources and flushes session state.

## Ownership rules

| Concern | Owner |
| --- | --- |
| CLI parsing and mode dispatch | `@tsuuanmi/pi` |
| Session selection, log, branching, and persistence | `@tsuuanmi/pi` |
| Model IDs, provider protocols, and assistant event streams | `@tsuuanmi/pi-ai` |
| Agent loop, tool contracts, compaction, and agent state | `@tsuuanmi/pi-agent` |
| Generic task/team scheduling | `@tsuuanmi/pi-orchestrator` |
| Workflow state, gates, artifacts, and workflow receipts | `@tsuuanmi/pi-workflows` |
| Terminal rendering and input | `@tsuuanmi/pi-tui` |

## Source anchors

- [`packages/pi/src/main.ts`](../../packages/pi/src/main.ts) - process startup and mode dispatch.
- [`packages/pi/src/app/runtime.ts`](../../packages/pi/src/app/runtime.ts) - runtime service creation and session options.
- [`packages/pi/src/app/session.ts`](../../packages/pi/src/app/session.ts) - startup session selection.
- [`packages/pi/src/loader/resources.ts`](../../packages/pi/src/loader/resources.ts) - resource and package loading.
- [`packages/pi/src/runtime/agent-session-services.ts`](../../packages/pi/src/runtime/agent-session-services.ts) - cwd-bound services.
- [`packages/pi/src/runtime/agent-session-factory.ts`](../../packages/pi/src/runtime/agent-session-factory.ts) - agent/session construction.
- [`packages/pi/src/runtime/agent-session.ts`](../../packages/pi/src/runtime/agent-session.ts) - session lifecycle and agent event wiring.

See also [Agent Session Runtime](../../packages/pi/docs/runtime/agent-session.md), [Application Flow](../../packages/pi/docs/app/index.md), [Persistence Boundaries](./persistence-boundaries.md), and [Package Overview](./package-overview.md).
