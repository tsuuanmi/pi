# Tool Registration

`@tsuuanmi/pi-agent` owns the generic tool protocol and registration helpers. Host packages such as `@tsuuanmi/pi` own concrete tool implementations and register them with the agent runtime.

## Registry helpers

```typescript
import { createToolRegistry, registerTools } from "@tsuuanmi/pi-agent";

const registry = createToolRegistry();
registerTools(registry, hostTools);

agent.registerTools(registry.list(), { replace: true });
```

`createToolRegistry(initialTools?)` returns a `ToolRegistry` keyed by tool name. Registering a tool with an existing name replaces the previous tool.

`registerTools(registry, tools, options?)` registers a group of tools. Pass `{ replace: true }` to clear the registry before registration.

## Tool access policy

```typescript
import { resolveToolNames, resolveToolSelection } from "@tsuuanmi/pi-agent";

const visibleTools = resolveToolNames(allTools, {
  allowedToolNames: ["read", "bash"],
  excludedToolNames: ["bash"],
});

const activeTools = resolveToolSelection(allTools, previousActiveTools, {
  allowedToolNames: ["read", "bash"],
  activeToolNames: ["read"],
  includeNewlyRegisteredTools: true,
});
```

Use `ToolAccessPolicy` and `ToolSelectionPolicy` to keep allow/exclude rules consistent across agent runtimes.

## Agent convenience method

```typescript
agent.registerTools(hostTools);
agent.registerTools(nextTools, { replace: true });
```

`Agent.registerTools()` updates `agent.state.tools` using the same name-keyed registry behavior and returns the active tool list.

## Standard integration pattern

Use one name-keyed registry at the host boundary, then pass `registry.list()` into the active agent state. Extensions and workflow packages should contribute `AgentTool` instances, not mutate the runtime loop directly.

When tools change during a session, call `agent.registerTools(nextTools)` to merge by name or `agent.registerTools(nextTools, { replace: true })` to replace the active set.

## Package boundary

- `@tsuuanmi/pi-agent`: `AgentTool`, tool execution orchestration, lifecycle events, policies, and registration helpers.
- `@tsuuanmi/pi`: built-in tools such as `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` plus their output, path, diff, and truncation helpers.
- Optional protocol/runtime packages: may expose tools or `AgentRuntime` implementations, but should consume `@tsuuanmi/pi-agent` contracts instead of duplicating them.
