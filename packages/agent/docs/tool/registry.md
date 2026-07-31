# Tool Registration

`@tsuuanmi/pi-agent` owns the generic tool protocol and registration helpers. Host packages such as `@tsuuanmi/pi` own concrete tool implementations and register them with the agent runtime.

## Defining tools

Use `defineTool()` at the host boundary to validate required declaration fields before registration:

```typescript
import { defineTool } from "@tsuuanmi/pi-agent";
import { Type } from "typebox";

const tool = defineTool({
  name: "tool",
  description: "Read a value",
  label: "Tool",
  parameters: Type.Object({ path: Type.String() }),
  async execute(_toolCallId, args) {
    return { content: [{ type: "text", text: args.path }], details: {} };
  },
});
```

`defineTool()` validates `name`, `description`, and `label` without mutating the tool. Tools can declare `detailsSchema` to validate result details after execution and after `afterToolCall` replacements.

## Registry helpers

```typescript
import { createToolRegistry, registerTool } from "@tsuuanmi/pi-agent";

const registry = createToolRegistry();
registerTool(registry, hostTools);

agent.registerTool(registry.list(), { replace: true });
```

`createToolRegistry(initialTools?)` returns a `ToolRegistry` keyed by tool name. Duplicate tool names throw so host integrations fail fast instead of silently changing the active tool contract.

Use `registry.replace(tool)` or `registry.replaceMany(tools)` when replacement is intentional. `registerTool(registry, tools, options?)` registers a group of tools. Pass `{ replace: true }` to clear the registry before registration.

## Tool access policy

```typescript
import { resolveToolNames, resolveToolSelection } from "@tsuuanmi/pi-agent";

const visibleTools = resolveToolNames(allTools, {
  allowedToolNames: ["tool-a", "tool-b"],
  excludedToolNames: ["tool-b"],
});

const activeTools = resolveToolSelection(allTools, previousActiveTools, {
  allowedToolNames: ["tool-a", "tool-b"],
  activeToolNames: ["tool-a"],
  includeNewlyRegisteredTools: true,
});
```

Use `ToolAccessPolicy` and `ToolSelectionPolicy` to keep allow/exclude rules consistent across agent runtimes.

## Agent convenience method

```typescript
agent.registerTool(hostTools);
agent.registerTool(nextTools, { replace: true });
```

`Agent.registerTool()` updates `agent.state.tools` using the same name-keyed registry behavior and returns the active tool list. Duplicate names throw unless `{ replace: true }` clears the active set first.

## Standard integration pattern

Use one name-keyed registry at the host boundary, then pass `registry.list()` into the active agent state. Extensions and workflow packages should contribute `AgentTool` instances, not mutate the runtime loop directly.

When tools change during a session, call `agent.registerTool(nextTools)` to add new tool names or `agent.registerTool(nextTools, { replace: true })` to replace the active set.

## Package boundary

- `@tsuuanmi/pi-agent`: `AgentTool`, tool execution orchestration, lifecycle events, policies, and registration helpers.
- Host packages and Pi register concrete tools.
- Optional protocol/runtime packages: may expose tools or `AgentRuntime` implementations, but should consume `@tsuuanmi/pi-agent` contracts instead of duplicating them.
