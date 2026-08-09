# Hook Adapter

`src/hook-adapter.ts` adapts registered `AgentHook` values into the callback functions consumed by `AgentLoopConfig`.

The adapter is part of the Agent core boundary: the Agent owns when loop callbacks run, while higher-level packages provide host or workflow policy through `Agent.registerHook()`. Higher-level packages should use the public hook contract and an adapter, not call internal loop callbacks or implement a second model/tool loop.

## Responsibilities

The adapter connects these loop callbacks:

- `beforeToolCall` for authorization and blocking;
- `afterToolCall` for result transformation and termination;
- `prepareNextTurn` for context, model, and thinking-level updates.

`beforeRun` and `afterRun` are run-lifecycle hooks and are invoked by `Agent`; they are not loop callbacks created by this adapter.

## Composition

Hooks are combined in registration order:

- a blocking `beforeToolCall` result stops the before-tool phase;
- each `afterToolCall` hook receives the result and error state produced so far;
- later after-hook values override only the fields they return;
- later `prepareNextTurn` values replace earlier values for the same update field.

This keeps hook ordering and result composition deterministic while keeping the loop implementation independent of Pi sessions, extensions, UI state, and orchestration types.

## Package adapters

A package can translate its own contract into an Agent hook. For example, a host extension layer can map an extension `tool_call` handler to `beforeToolCall` and an extension `tool_result` handler to `afterToolCall`. The host owns the extension payload and policy; the Agent owns the adapter boundary and execution timing.

If a package introduces a lifecycle that is not an Agent lifecycle, it should keep that hook local to the package and expose a separate adapter only where it intentionally crosses the Agent boundary. Do not add package-specific payloads to `AgentHook` merely to avoid writing an adapter.
