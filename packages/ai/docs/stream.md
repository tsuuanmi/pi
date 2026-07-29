# stream

Mirrors `src/stream.ts`.

`stream(model, context, options?)` resolves the provider registered for `model.api` and delegates to that provider's stream implementation.

`complete(model, context, options?)` calls `stream()` and awaits the stream result.

## Behavior

- Built-in providers are registered as a side effect of importing `#ai/provider/built-ins`.
- If no provider is registered for `model.api`, `stream()` throws `No provider registered for api: ...`.
- The returned stream is an `AssistantMessageEventStream`; callers can either iterate events or await `result()`.

```ts
import { complete, getModel } from "@tsuuanmi/pi-ai";

const model = getModel("openai", "gpt-5.2");
const message = await complete(model, {
  systemPrompt: "Be concise.",
  messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
});
```
