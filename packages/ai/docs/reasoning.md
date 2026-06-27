# Thinking and Reasoning

Many models support extended thinking/reasoning capabilities where they show their internal thought process. You can check model support via the `reasoning` property.

## Checking Reasoning Support

```typescript
import { getModel } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
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

const model = getModel("anthropic", "claude-sonnet-4-20250514");
const response = await completeSimple(model, {
  messages: [{ role: "user", content: "Solve: 2x + 5 = 13" }],
}, {
  reasoning: "medium",
});
```

Reasoning levels: `"minimal"` | `"low"` | `"medium"` | `"high"` | `"xhigh"`

Non-reasoning models silently ignore the `reasoning` option.

### Level Mapping

| Level | Anthropic | OpenAI Responses | OpenAI Completions |
|-------|-----------|-----------------|-------------------|
| `minimal` | `thinkingEnabled: true, effort: "low"` | `reasoningEffort: "low"` | Omitted |
| `low` | `thinkingEnabled: true, effort: "low"` | `reasoningEffort: "low"` | Omitted |
| `medium` | `thinkingEnabled: true, effort: "medium"` | `reasoningEffort: "medium"` | Omitted |
| `high` | `thinkingEnabled: true, effort: "high"` | `reasoningEffort: "high"` | Omitted |
| `xhigh` | `thinkingEnabled: true, effort: "xhigh"` | Not supported | Not supported |

## Provider-Specific Options

### Anthropic Thinking

```typescript
import { getModel, stream } from "@tsuuanmi/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
const s = stream(model, context, {
  thinkingEnabled: true,
  effort: "high",
  thinkingDisplay: "summarized", // or "omitted"
});
```

| Option | Description |
|--------|-------------|
| `thinkingEnabled` | Enable extended thinking |
| `effort` | `"low"` \| `"medium"` \| `"high"` \| `"xhigh"` \| `"max"` (Opus 4.6 only) |
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