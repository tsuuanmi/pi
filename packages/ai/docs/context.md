# Context and Messages

The `Context` object holds the conversation state and is the primary input to all streaming and completion functions.

## Context Interface

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `systemPrompt` | `string?` | System-level instructions |
| `messages` | `Message[]` | Conversation history |
| `tools` | `Tool[]?` | Available tools for this request |

## Message Types

The `Message` union covers the three roles in a conversation: `UserMessage`, `AssistantMessage`, and `ToolResultMessage`.

### User Message

```typescript
const userMessage: Message = {
  role: "user",
  content: "What is the weather in London?",
  timestamp: Date.now(),
};
```

Content can be a plain string or an array of text content blocks:

```typescript
const message: Message = {
  role: "user",
  content: [{ type: "text", text: "What is the weather in London?" }],
  timestamp: Date.now(),
};
```

### Assistant Message

```typescript
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: Provider;
  model: string;
  responseModel?: string;   // Concrete `chunk.model` when different from the requested `model`
  responseId?: string;       // Provider-specific response/message identifier when the upstream API exposes one
  diagnostics?: AssistantMessageDiagnostic[];
  usageProvenance?: UsageProvenance;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}
```

#### Content Blocks

| Block Type | Fields | Description |
|------------|--------|-------------|
| `text` | `type: "text"`, `text: string`, `textSignature?` | Text content (signature carries OpenAI responses message metadata) |
| `thinking` | `type: "thinking"`, `thinking: string`, `thinkingSignature?`, `redacted?` | Extended thinking content; `thinkingSignature` carries opaque reasoning IDs for multi-turn continuity; `redacted` marks safety-filtered thinking |
| `toolCall` | `type: "toolCall"`, `id: string`, `name: string`, `arguments: Record<string, unknown>`, `thoughtSignature?` | Tool invocation |

### Tool Result Message

```typescript
const toolResult: Message = {
  role: "toolResult",
  toolCallId: call.id,
  toolName: call.name,
  content: [{ type: "text", text: "Result text" }],
  details: undefined,  // optional provider/tool-specific details
  isError: false,
  timestamp: Date.now(),
};
```

`ToolResultMessage` is generic over `TDetails` so callers can attach structured details to a result; the field is optional and ignored by providers.

## Cross-Provider Handoffs

When messages from one provider are sent to a different provider, the library automatically transforms them:

- **User and tool result messages**: passed through unchanged
- **Assistant messages from the same provider/API**: preserved as-is
- **Assistant messages from different providers**: thinking blocks converted to `<thinking>` tagged text
- **Tool calls and regular text**: preserved unchanged

```typescript
import { getModel, complete, type Context } from "@tsuuanmi/pi-ai";

const claude = getModel("anthropic", "claude-sonnet-4-5");
const context: Context = { messages: [] };

context.messages.push({ role: "user", content: "What is 25 * 18?", timestamp: Date.now() });
const claudeResponse = await completeSimple(claude, context, { reasoning: "high" });
context.messages.push(claudeResponse);

// Switch to GPT — Claude's thinking becomes <thinking> tagged text
const gpt = getModel("openai", "gpt-4o-mini");
context.messages.push({ role: "user", content: "Is that correct?", timestamp: Date.now() });
const gptResponse = await complete(gpt, context);
```

## Context Serialization

The `Context` object is JSON-serializable:

```typescript
const serialized = JSON.stringify(context);

// Later: restore and continue
const restored: Context = JSON.parse(serialized);
restored.messages.push({ role: "user", content: "Follow-up question", timestamp: Date.now() });
const response = await complete(model, restored);
```

## Usage Tracking

Every `AssistantMessage` includes a `usage` object:

```typescript
interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;  // Subset of cacheWrite written with 1h retention (Anthropic only)
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

Costs are in USD. Input and output costs are per-token rates multiplied by usage. Cache costs follow provider-specific pricing (e.g., Anthropic charges 2x base input for 1h cache writes).

`AssistantMessage` also carries an optional `usageProvenance` field describing how usage was obtained: `provider_reported` (with the reported field names), `provider_unavailable`, or `fallback_default`.
