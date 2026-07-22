# Tool Registration

`@tsuuanmi/pi-agent` owns the generic tool protocol and registration helpers. Host packages such as `@tsuuanmi/pi` own concrete tool implementations and register them with the agent runtime.

## Registry helpers

```typescript
import { createAgentToolRegistry, registerAgentTools } from "@tsuuanmi/pi-agent";

const registry = createAgentToolRegistry();
registerAgentTools(registry, hostTools);
const tools = registry.list();
```

`createAgentToolRegistry(initialTools?)` returns an `AgentToolRegistry` keyed by tool name. Registering a tool with an existing name replaces the previous tool.

`registerAgentTools(registry, tools, options?)` registers a group of tools. Pass `{ replace: true }` to clear the registry before registration.

## Agent convenience method

```typescript
agent.registerTools(hostTools);
agent.registerTools(nextTools, { replace: true });
```

`Agent.registerTools()` updates `agent.state.tools` using the same name-keyed registry behavior and returns the active tool list.

## Package boundary

- `@tsuuanmi/pi-agent`: `AgentTool`, tool execution, lifecycle events, and registration helpers.
- `@tsuuanmi/pi`: built-in tools such as `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` plus their output, path, diff, and truncation helpers.
