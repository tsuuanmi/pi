# `@tsuuanmi/pi-agent`

[Package README](../../../packages/agent/README.md) | [Package reference](../../../packages/agent/docs/index.md) | [Architecture reference](../../../packages/agent/docs/architecture.md) | [Public barrel](../../../packages/agent/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi-agent` is the reusable single-agent execution kernel above `@tsuuanmi/pi-ai`. It owns agent state and the model/tool turn loop while allowing a host to supply models, credentials, tools, policy hooks, persistence, and UI.

## Boundary

**Owns**

- The stateful `Agent` facade, active-run lifecycle, steering/follow-up queues, abort, reset, and disposal.
- Provider/model/tool turn execution, including sequential or bounded-parallel tool calls.
- Agent messages, provider conversion, lifecycle events, hooks, traces, warnings, and loop detection.
- Generic tool contracts, registry, policies, output limiting, details validation, and receipts.
- Structured-output validation, pruning, and compaction message helpers.
- Host-neutral subagent manager, record, request, result, lifecycle-tool, progress, thinking-level, and receipt contracts.
- An explicitly separate Node utility entry for execution environments, processes, shell lookup, paths, JSONL, and mutation queues.

**Does not own**

- Provider adapters, model catalogs, or canonical provider transport; AI owns them.
- Credentials, persistent sessions, concrete coding tools, extension loading, or UI; Pi owns them.
- Task DAGs, agent routing, retries across tasks, verification, team policy, or checkpoint storage; Orchestrator and Workflows own those concerns.
- A concrete subagent worker, durable record store, isolated Pi session, or tmux backend. A host implements `SubagentManager`.

## Public entry points

| Import | Surface |
|---|---|
| `@tsuuanmi/pi-agent` | `Agent`, run/state/config contracts, messages, events, hooks, traces, `ToolSpec`/`ContextToolSpec`, receipts, pruning, structured output, and subagent contracts/tools |
| `@tsuuanmi/pi-agent/node` | All root exports plus `NodeExecutionEnv`, process/shell/path helpers, JSONL utilities, and file mutation queues |
| `@tsuuanmi/pi-agent/package.json` | Package metadata |

The root entry avoids Node built-ins and is the host-neutral API. Browser-capable code must not import the `/node` subpath. `#agent/*` aliases are internal.

## Components

| Component | Source | Responsibility |
|---|---|---|
| Agent facade | [`src/agent/index.ts`](../../../packages/agent/src/agent/index.ts) | Public stateful API for prompt, continue, isolated run, queues, configuration, and subscriptions |
| Lifecycle and state | [`src/agent/lifecycle.ts`](../../../packages/agent/src/agent/lifecycle.ts), [`src/agent/state.ts`](../../../packages/agent/src/agent/state.ts) | Single active prompt lifecycle, state projection, snapshots, reset, abort, and dispose |
| Turn loop | [`src/loop.ts`](../../../packages/agent/src/loop.ts) | Alternates model streaming and tool execution until a stop, pause, abort, or limit condition |
| Provider bridge | [`src/agent/provider.ts`](../../../packages/agent/src/agent/provider.ts) | Converts agent messages to AI context, resolves credentials, calls the stream function, and consumes events |
| Tool execution | [`src/agent/tool-execution.ts`](../../../packages/agent/src/agent/tool-execution.ts) | Finds and validates tools, runs hooks, schedules calls, limits output, and emits results in model-call order |
| Events and hooks | [`src/events.ts`](../../../packages/agent/src/events.ts), [`src/hooks.ts`](../../../packages/agent/src/hooks.ts) | Observable lifecycle plus ordered policy/control points |
| Messages and compaction | [`src/messages/`](../../../packages/agent/src/messages), [`src/compaction/`](../../../packages/agent/src/compaction) | Custom agent roles, provider conversion, serialization, and file-operation extraction |
| Tool contracts | [`src/tool/`](../../../packages/agent/src/tool) | `Tool`, `ToolSpec`, `ContextToolSpec`, `ToolRegistry`, policy, result, output, and receipt types |
| Subagent contracts | [`src/subagents/`](../../../packages/agent/src/subagents) | Host interface, durable record types, lifecycle tool specs, progress, receipts, and yield parsing |
| Node adapters | [`src/node/`](../../../packages/agent/src/node) | Typed filesystem/process execution, Bash resolution, paths, JSONL, and serialized mutations |

## Turn data flow

```text
Host calls Agent.prompt() / continue() / run()
  -> Agent snapshots state and establishes one lifecycle
  -> transform AgentMessage[] into AI Context
  -> call injected/default StreamFunction
  -> consume normalized assistant events
  -> append assistant message
  -> validate and execute requested tools
  -> append tool-result messages
  -> invoke next-turn hooks and queue checks
  -> repeat or emit agent_end
```

Events first update Agent state and then run subscribed listeners in registration order. Hooks are awaited and are part of execution semantics: a before-tool hook may block a call, an after-tool hook may transform the result, and a prepare-next-turn hook may replace context/model/thinking fields.

`Agent.run()` creates an isolated execution with copied configuration and hooks but an empty transcript. Calls to `run()` on one Agent instance are queued single-flight.

## Dependencies

### Workspace

| Dependency | Contract used |
|---|---|
| `@tsuuanmi/pi-ai` | Models, context/messages, stream options/events, default stream function, thinking levels, and tool argument validation |

### External runtime

| Dependency | Why it is used |
|---|---|
| `typebox` | Tool and structured-output schemas, validation, and subagent lifecycle tool parameters |
| `ignore` | Declared in the manifest; no current `src/` import was found |
| `yaml` | Declared in the manifest; no current `src/` import was found |

Node built-ins are confined to the `/node` implementation modules.

## Interactions with other packages

| Consumer | Contract |
|---|---|
| `@tsuuanmi/pi-orchestrator` | Treats `Agent` instances as schedulable workers and invokes `Agent.run()` for individual tasks |
| `@tsuuanmi/pi-workflows` | Uses generic agent/subagent/tool/receipt contracts and injects workflow policy through adapters rather than changing the agent loop |
| `@tsuuanmi/pi` | Constructs and configures Agent, supplies model/auth/stream callbacks and coding tools, persists events, bridges extensions, and implements the concrete `SubagentManager` |

## State and persistence

The `Agent` holds in-memory state and a transcript. Its state snapshots are values, not Pi session storage. Agent does not choose a persistence format or filesystem location.

Subagent types describe durable records and operations, but their store and execution backend belong to the host. Pi's implementation persists records and creates isolated Pi sessions; workflows consumes the same injected manager.

## Extension points

- `AgentOptions` for stream, model/auth lookup, context conversion, provider observers, clocks, execution mode/limits, queue policy, transport, loop detection, and pause behavior.
- `Agent.registerHook()` for before/after run, before/after tool call, and next-turn preparation.
- `Agent.subscribe()` for lifecycle, message, tool, trace, warning, loop, and request events.
- `ToolRegistry` and `Tool`/`ToolSpec` for host capabilities.
- `StreamFunction` for an alternate AI-compatible model backend.
- `SubagentManager` for a host-specific durable worker implementation.
- `NodeExecutionEnv` and lower-level `/node` utilities for Node hosts.

## Runtime constraints

- ESM; package engine is Node.js 22.19 or newer.
- `prompt()` and `continue()` allow one active lifecycle per Agent.
- Tool calls are parallel by default. If any tool in one assistant batch requires sequential execution, the batch runs sequentially.
- Event listeners and hooks are awaited, so their latency and failures can affect the run.
- The Node execution adapter requires Bash and performs abort/timeout-aware process-tree cleanup.
