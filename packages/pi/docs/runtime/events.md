# Events

Pi exposes two observation channels with different ownership:

1. `ExtensionAPI.on(...)` subscribes to the typed Agent and Pi host lifecycles.
2. `EventBus` is an untyped, extension-to-extension custom channel.

Neither channel is a control point. Use `ExtensionAPI.onHook(...)` when a callback can block, transform, replace, cancel, or handle host behavior. See [Hooks](hooks.md).

## Extension lifecycle events

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("agent_start", (_event, ctx) => {
    ctx.ui.notify("Agent started", "info");
  });

  pi.on("session_start", (event) => {
    console.log(event.reason);
  });
}
```

Agent-owned events reuse `AgentEvent` from `@tsuuanmi/pi-agent` unchanged. Pi adds only host-owned events for sessions, models, thinking levels, and provider responses. Event handlers run in extension load order, errors are isolated and reported, and return values are ignored.

The complete typed lifecycle is documented in [Extensions](../extensions/index.md).

## EventBus

`createEventBus()` creates a custom channel for cooperating extensions:

```typescript
interface EventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

interface EventBusController extends EventBus {
  clear(): void;
}
```

```typescript
import { createEventBus } from "@tsuuanmi/pi/extensions";

const bus = createEventBus();
const unsubscribe = bus.on("my-extension:complete", (data) => {
  console.log(data);
});

bus.emit("my-extension:complete", { ok: true });
unsubscribe();
bus.clear();
```

EventBus invokes handlers in registration order. `emit()` does not await asynchronous completion; rejected handlers are caught and logged independently. EventBus channels do not mirror Agent or session lifecycle events.

## See also

- [Hooks](hooks.md)
- [Extensions](../extensions/index.md)
