# Tool Registration

`@tsuuanmi/pi-agent` owns the core tool contract, tool construction, and tool registry. Host packages own concrete implementations and adapt host context before registering executable `Tool` instances.

## Defining tools

Use `Tool.define()` to validate and create an immutable runtime tool:

```typescript
import { Tool } from "@tsuuanmi/pi-agent";
import { Type } from "typebox";

const tool = Tool.define({
  name: "tool",
  description: "Read a value",
  label: "Tool",
  parameters: Type.Object({ path: Type.String() }),
  async execute(_toolCallId, args) {
    return { content: [{ type: "text", text: args.path }], details: {} };
  },
});
```

`Tool.define()` validates the required declaration fields. Tools may also declare `detailsSchema` and `maxOutputChars`.

## Registry

```typescript
import { ToolRegistry } from "@tsuuanmi/pi-agent";

const registry = new ToolRegistry();
registry.register(tool);
registry.registerMany(hostTools);

agent.setTools(registry.list());
```

`ToolRegistry` is keyed by tool name. Duplicate names throw so integrations fail fast instead of silently changing the active contract. Use `replace()` or `replaceMany()` only when replacement is intentional.

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

Policies select tools; they do not create or register them.

## Agent boundary

`Agent` owns messages, model state, lifecycle, and execution. It receives an active `Tool[]` snapshot through `setTools()` and exposes a copy with `getTools()`. It does not define tool schemas or registry policy.

## Host adapters

Pi and workflow adapters may add execution context or rendering metadata. They must convert their host-specific specs into `Tool` instances before registration. The core package does not depend on Pi, workflow, session, or UI types.

## Extension boundary

`@tsuuanmi/pi-agent` owns the generic `Tool` contract, validation, registry behavior, and execution. Host and workflow packages own concrete tool implementations and adapt their context before registering them. A package that needs to authorize a call or transform its result should register an `AgentHook`; it should not add host-specific policy to the core Tool contract.

Specialized agents should normally be configured `Agent` instances, factories, or wrappers around the core Agent. They should reuse the core model/tool loop rather than define a second loop.

See [Agent architecture](../architecture.md) for the complete ownership boundary.

## Package boundary

- `@tsuuanmi/pi-agent`: `Tool`, `ToolSpec`, `ToolResult`, `ToolRegistry`, execution, policies, and receipts.
- Host packages: concrete implementations and context adapters.
- `@tsuuanmi/pi-orchestrator`: consumes configured `Agent` instances; it does not own tools or a tool registry.
