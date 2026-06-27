# Events

Pi event system for extensions and the TUI.

## Event Types

The event system provides typed events for agent lifecycle, tool execution, and UI updates. Events are emitted by the agent and can be subscribed to by extensions and UI components.

## Usage in Extensions

```typescript
ctx.on("message_end", (event) => {
  console.log("Message completed:", event.message);
});
```

## See Also

- [Extensions](../extensions/extensions.md) - Extension API and event hooks