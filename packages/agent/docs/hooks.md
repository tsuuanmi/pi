# Agent Hooks

`src/hooks.ts` defines the public hook contracts used by `Agent.registerHook()` and the `hooks` option in `AgentOptions`.

An `AgentHook` is a control boundary owned by the Agent. It lets an integration authorize execution, transform a result, or prepare the next turn without reimplementing the model/tool loop. The Agent owns hook invocation, ordering, composition, and lifecycle semantics; the registering package owns the policy implemented by the hook.

See [Agent architecture](./architecture.md) for the package ownership rules.

## Registration

```typescript
const removeHook = agent.registerHook({
  name: "host.tool-policy",
  beforeToolCall: async ({ toolCall }) => {
    if (toolCall.name === "restricted_tool") {
      return { block: true, reason: "Tool is disabled by host policy" };
    }
    return undefined;
  },
});

removeHook();
```

Hooks can also be supplied through `AgentOptions.hooks` when the Agent is created. Registration has these guarantees:

- Hook names must be non-empty, trimmed, and unique for an Agent.
- Hooks run in registration order.
- `registerHook()` returns a disposer that removes that registration.
- A hook must implement at least one handler.
- Hook registration is scoped to the Agent instance; there is no global hook registry.

## Hook points

| Hook | When it runs | Supported effect |
| --- | --- | --- |
| `beforeRun` | Before an isolated `Agent.run()` execution begins | Observe or prepare the run; it has no control return value. |
| `afterRun` | After an isolated `Agent.run()` succeeds or fails | Observe the result or error; it has no control return value. |
| `beforeToolCall` | After a tool call is selected and validated, before the tool executes | Return `{ block: true, reason }` to prevent execution. |
| `afterToolCall` | After a tool returns or fails | Replace content/details, change `isError`, or request termination. |
| `prepareNextTurn` | After a turn and its tool results, before the next model turn | Replace the next context, model, or thinking level. |

`beforeRun` and `afterRun` apply to the isolated `run()` lifecycle. They are not general callbacks around persistent `prompt()` or `continue()` calls. Tool and next-turn hooks are integrated into the loop used by both persistent and isolated execution.

## Composition semantics

The Agent composes hooks rather than allowing each package to run the loop itself:

- Before-tool hooks run in registration order. The first blocking result stops that before-tool phase.
- After-tool hooks run in registration order. Each hook receives the result produced by the preceding hook, so later hooks can build on earlier transformations.
- `prepareNextTurn` updates are applied in registration order. Later values for `context`, `model`, or `thinkingLevel` replace earlier values for the same field.
- Hook callbacks are awaited. A callback should handle expected policy failures explicitly; unexpected callback failures participate in Agent execution error handling.

## Hook versus event

Use a hook when the integration must affect execution:

- authorize or block a tool call;
- redact or transform a tool result;
- terminate after a tool result;
- change the context, model, or thinking level for the next turn.

Use [`AgentEvent`](./events.md) when the integration only needs to observe execution for logging, UI, persistence, metrics, tracing, or progress. An event-style API in a higher-level package is still a hook if its handler can block or transform execution.

## Extension boundary

A higher-level package should register an existing `AgentHook` when its behavior fits an Agent lifecycle point. If the lifecycle belongs to that package instead, the package should define and invoke a package-local hook and optionally adapt it to an Agent hook:

- tool authorization supplied by a host or extension can register `beforeToolCall`;
- session or UI policy remains in the host package;
- task retry and verification policy remains in the orchestrator;
- workflow policy remains in the workflow package.

Core hooks must remain host-neutral. The Agent package should add a new hook only for a lifecycle point it owns and can guarantee across integrations.

## Isolated runs

`Agent.run()` creates an isolated Agent state for the task-oriented execution. The current Agent hook registrations are copied into that isolated Agent so core and host policy still apply. Event subscriptions are not copied; subscribe to the Agent instance that owns the execution if event observation is required.
