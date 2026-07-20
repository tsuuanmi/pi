# Thinking and Reasoning

Many models support extended thinking/reasoning capabilities where they show their internal thought process. You can check model support via the `reasoning` property.

## Checking Reasoning Support

```typescript
import { getModel } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
if (model.reasoning) {
  console.log("Model supports reasoning/thinking");
}
```

Use `getSupportedThinkingLevels()` to list valid levels:

```typescript
import { getSupportedThinkingLevels } from "@tsuuanmi/pi-ai";

const levels = getSupportedThinkingLevels(model);
// ["off", "minimal", "low", "medium", "high", "xhigh"] for reasoning models
// ["off"] for non-reasoning models
```

## Unified Interface

`streamSimple()` and `completeSimple()` accept a `reasoning` option that maps to provider-specific parameters:

```typescript
import { getModel, completeSimple } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
const response = await completeSimple(model, {
  messages: [{ role: "user", content: "Solve: 2x + 5 = 13", timestamp: Date.now() }],
}, {
  reasoning: "medium",
});
```

Reasoning levels: `"minimal"` | `"low"` | `"medium"` | `"high"` | `"xhigh"`

Non-reasoning models silently ignore the `reasoning` option.

### Level Mapping

`streamSimple`/`completeSimple` clamp the requested level to the nearest supported one and pass it through for OpenAI; for Anthropic it is mapped to an effort level:

| Level | Anthropic (`effort`) | OpenAI Responses/Completions (`reasoningEffort`) |
|-------|----------------------|-------------------------------------------------|
| `minimal` | `"low"` | `"minimal"` |
| `low` | `"low"` | `"low"` |
| `medium` | `"medium"` | `"medium"` |
| `high` | `"high"` | `"high"` |
| `xhigh` | `"high"` (default; `"xhigh"` only on models that opt in via `thinkingLevelMap`) | `"xhigh"` |

For Anthropic, `thinkingEnabled: true` is set whenever a level is requested. `mapThinkingLevelToEffort` consults `model.thinkingLevelMap` first, falling back to the table above.

## Provider-Specific Options

### Anthropic Thinking

```typescript
import { getModel, stream } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-5");
const s = stream(model, context, {
  thinkingEnabled: true,
  effort: "high",
  thinkingDisplay: "summarized", // or "omitted"
});
```

| Option | Description |
|--------|-------------|
| `thinkingEnabled` | Enable extended thinking |
| `effort` | `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"` (`"max"` is only valid on Opus 4.6; Opus 4.7+ and Fable 5 use `"xhigh"`) |
| `thinkingDisplay` | `"summarized"` (default) \| `"omitted"` — controls how thinking content returns |

When `thinkingDisplay` is `"omitted"`, thinking blocks return empty text but the encrypted signature still travels for multi-turn continuity. This yields faster time-to-first-text-token when your UI does not surface thinking.

### OpenAI Reasoning

```typescript
import { getModel, complete } from "@tsuuanmi/pi-ai";

const model = getModel("openai", "gpt-5-mini");
const response = await complete(model, context, {
  reasoningEffort: "medium",
  reasoningSummary: "detailed", // OpenAI Responses API only
});
```

## Streaming Thinking Content

Thinking blocks are delivered through dedicated streaming events:

```typescript
const s = streamSimple(model, context, { reasoning: "high" });

for await (const event of s) {
  switch (event.type) {
    case "thinking_start":
      console.log("[Model started thinking]");
      break;
    case "thinking_delta":
      process.stdout.write(event.delta);
      break;
    case "thinking_end":
      console.log("\n[Thinking complete]");
      break;
  }
}
```

## Accessing Thinking Blocks

After completion, thinking blocks are available in the message content:

```typescript
const message = await completeSimple(model, context, { reasoning: "high" });

for (const block of message.content) {
  if (block.type === "thinking") {
    console.log("Thinking:", block.thinking);
  } else if (block.type === "text") {
    console.log("Response:", block.text);
  }
}
```

## Cross-Provider Thinking Handoff

When switching providers mid-conversation, thinking blocks from the previous provider are automatically converted to `<thinking>` tagged text for compatibility. Tool calls and regular text are preserved unchanged.
