# Context and Messages

The `Context` object holds the conversation state and is the primary input to all streaming and completion functions.

## Context Interface

```typescript
interface Context {
  systemPrompt?: string;
  messages: AgentMessage[];
  tools?: Tool[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `systemPrompt` | `string?` | System-level instructions |
| `messages` | `AgentMessage[]` | Conversation history |
| `tools` | `Tool[]?` | Available tools for this request |

## Message Types

### User Message

```typescript
const userMessage: AgentMessage = {
  role: "user",
  content: "What is the weather in London?",
  timestamp: Date.now(),
};
```

Content can be a string or an array of content blocks:

```typescript
const multimodalMessage: AgentMessage = {
  role: "user",
  content: [
    { type: "text", text: "What is in this image?" },
    { type: "image", url: "https://example.com/photo.jpg" },
  ],
  timestamp: Date.now(),
};
```

### Assistant Message

```typescript
interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];     // text, thinking, and toolCall blocks
  api: string;
  provider: string;
  model: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  timestamp: number;
}
```

#### Content Blocks

| Block Type | Fields | Description |
|------------|--------|-------------|
| `text` | `type: "text"`, `text: string` | Text content |
| `thinking` | `type: "thinking"`, `thinking: string` | Extended thinking content |
| `toolCall` | `type: "toolCall"`, `id: string`, `name: string`, `arguments: Record<string, unknown>` | Tool invocation |

### Tool Result Message

```typescript
const toolResult: AgentMessage = {
  role: "toolResult",
  toolCallId: call.id,
  toolName: call.name,
  content: [{ type: "text", text: "Result text" }],
  isError: false,
  timestamp: Date.now(),
};
```

### Notification Message (Custom Type)

Extend `AgentMessage` via declaration merging:

```typescript
declare module "@tsuuanmi/pi-ai" {
  interface CustomAgentMessages {
    notification: { role: "notification"; text: string; timestamp: number };
  }
}
```

Handle custom types in `convertToLlm` (agent package) or filter them when building context for the LLM.

## Cross-Provider Handoffs

When messages from one provider are sent to a different provider, the library automatically transforms them:

- **User and tool result messages**: passed through unchanged
- **Assistant messages from the same provider/API**: preserved as-is
- **Assistant messages from different providers**: thinking blocks converted to `<thinking>` tagged text
- **Tool calls and regular text**: preserved unchanged

```typescript
import { getModel, complete, Context } from "@tsuuanmi/pi-ai";

const claude = getModel("anthropic", "claude-sonnet-4-20250514");
const context: Context = { messages: [] };

context.messages.push({ role: "user", content: "What is 25 * 18?" });
const claudeResponse = await complete(claude, context, { thinkingEnabled: true });
context.messages.push(claudeResponse);

// Switch to GPT — Claude's thinking becomes <thinking> tagged text
const gpt = getModel("openai", "gpt-4o-mini");
context.messages.push({ role: "user", content: "Is that correct?" });
const gptResponse = await complete(gpt, context);
```

## Context Serialization

The `Context` object is JSON-serializable:

```typescript
const serialized = JSON.stringify(context);

// Later: restore and continue
const restored: Context = JSON.parse(serialized);
restored.messages.push({ role: "user", content: "Follow-up question" });
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
  cacheWrite1h?: number;
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