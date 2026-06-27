# Event Stream

The `EventStream` class that underpins all streaming operations in `@tsuuanmi/pi-ai`.

## `EventStream<TEvent, TResult>`

A typed async iterable stream that pushes events and terminates with a result:

```typescript
import { EventStream } from "@tsuuanmi/pi-ai";

const stream = new EventStream<AssistantMessageEvent, AssistantMessage>(
  (event) => event.type === "done" || event.type === "error",
  (event) => event.type === "done" ? event.message : event.error,
);
```

### Methods

| Method | Description |
|--------|-------------|
| `push(event)` | Push an event into the stream |
| `end(result)` | Signal stream completion with a final result |
| `result()` | Await the final result |
| `[Symbol.asyncIterator]()` | Iterate over events |

### Patterns

```typescript
// Consume events
for await (const event of stream) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

// Or await the final result
const message = await stream.result();
```

## See Also

- [Streaming](../streaming.md) - High-level streaming API