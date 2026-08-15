# Hooks

Hooks are control points: a handler may block, transform, replace, cancel, or handle host behavior. Observation-only callbacks are events and use `ExtensionAPI.on(...)`; hooks use `ExtensionAPI.onHook(...)`.

## Ownership

- `@tsuuanmi/pi-agent` owns `AgentHook`, its registry, and model/tool-loop timing.
- `@tsuuanmi/pi` owns session and extension hooks.
- `agent-bridge.ts` adapts Pi's `tool_call` and `tool_result` hooks to Agent `beforeToolCall` and `afterToolCall`.

Pi does not reimplement the Agent hook registry, and `pi-agent` does not import Pi extension types.

## Extension hooks

```typescript
export default function (pi: ExtensionAPI) {
  pi.onHook("tool_call", async (hook, ctx) => {
    if (hook.toolName !== "bash") return;
    const approved = await ctx.ui.confirm("Run command?", String(hook.input.command));
    if (!approved) return { block: true, reason: "Rejected by user" };
  });

  pi.onHook("context", (hook) => ({
    messages: hook.messages.filter(shouldKeepMessage),
  }));
}
```

The extension hook lifecycle includes:

- resource discovery: `resources_discover`;
- session control: `session_before_switch`, `session_before_compact`, `session_before_tree`;
- prompt/provider control: `before_agent_start`, `context`, `before_provider_request`, `message_end`;
- tool/shell control: `tool_call`, `tool_result`, `user_bash`;
- input control: `input`.

Handlers run in extension load order. Specialized reducers preserve each hook's existing result semantics: blocking short-circuits where documented, transformations chain, and omitted patch fields preserve current values. Hook errors follow the hook-specific policy; `tool_call` errors block execution through the Agent bridge.

## Agent hooks

Use `Agent.registerHook()` for host-neutral Agent policy:

```typescript
const unregister = agent.registerHook({
  name: "policy",
  beforeToolCall: ({ toolCall }) => {
    if (toolCall.name === "dangerous") {
      return { block: true, reason: "Blocked by policy" };
    }
  },
});
```

Agent hooks are instance-scoped and run in registration order. See `packages/agent/docs/hooks.md` for the full contract.

## See also

- [Events](events.md)
- [Extensions](../extensions/index.md)
- [Agent hooks](../../../agent/docs/hooks.md)
