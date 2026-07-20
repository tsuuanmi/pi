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

The constructor takes two callbacks: `isComplete(event)` decides when the stream is done, and `extractResult(event)` produces the final result from that terminal event.

### Methods

| Method | Description |
|--------|-------------|
| `push(event)` | Push an event into the stream. If `isComplete(event)` returns true, the stream is marked done and the result is resolved. |
| `end(result?)` | Mark the stream done. If a `result` is provided and no terminal event was pushed, it resolves the result promise. |
| `result()` | `Promise` resolving to the final result once a terminal event is pushed (or `end(result)` is called with a value). |
| `[Symbol.asyncIterator]()` | Async iterable over events. |

### Back-pressure

Events pushed with no waiting consumer are queued. Once the stream is done, pending consumers immediately receive `done` results.

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

## `AssistantMessageEventStream`

`AssistantMessageEventStream` extends `EventStream<AssistantMessageEvent, AssistantMessage>` with the terminal-event logic for `done`/`error` baked in. It is the return type of `stream`, `streamSimple`, and the per-provider stream functions. Use `createAssistantMessageEventStream()` to construct one in extensions.

## See Also

- [Streaming](../streaming.md) - High-level streaming API
