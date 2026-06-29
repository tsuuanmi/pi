# Events

Pi event system for extensions and the TUI.

## Overview

The event system provides a typed publish-subscribe event bus for agent lifecycle, tool execution, and UI updates. Events are emitted by the agent and can be subscribed to by extensions and UI components.

## EventBus

The core event bus is created by `createEventBus()`:

```typescript
interface EventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

interface EventBusController extends EventBus {
  clear(): void;
}
```

### Creating an Event Bus

```typescript
import { createEventBus } from "@tsuuanmi/pi-coding-agent";

const bus = createEventBus();

// Subscribe to events — returns an unsubscribe function
const unsubscribe = bus.on("message_end", (data) => {
  console.log("Message completed:", data);
});

// Emit events
bus.emit("message_end", { message });

// Clean up
unsubscribe(); // Remove a single handler
bus.clear();   // Remove all handlers
```

### Error Handling

Event handlers are wrapped with error isolation. If a handler throws, the error is logged to stderr but does not affect other handlers or the event emitter:

```
Event handler error (message_end): <error>
```

### Async Handlers

Handlers may be `async`. The bus awaits each handler in order. Errors in async handlers are caught and logged the same way as sync handler errors.

## Event Channels

Extensions subscribe to events using the `ctx.on()` method. See the [Extensions](../extensions/extensions.md) documentation for the full list of event channels and hook signatures.

## See Also

- [Extensions](../extensions/extensions.md) - Extension API and event hooks