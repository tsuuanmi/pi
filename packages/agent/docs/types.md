# Types

Core type definitions for `@tsuuanmi/pi-agent`.

## AgentMessage

```typescript
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

Union of LLM messages (`Message` from `@tsuuanmi/pi-ai`) and custom app messages. Extend via declaration merging:

```typescript
declare module "@tsuuanmi/pi-agent" {
  interface CustomAgentMessages {
    artifact: ArtifactMessage;
    notification: NotificationMessage;
  }
}
```

## AgentTool

```typescript
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}
```

| Field | Description |
|-------|-------------|
| `label` | Human-readable label for UI display |
| `prepareArguments` | Optional compatibility shim for raw arguments before schema validation |
| `execute` | Execute the tool call. Throw on failure. |
| `executionMode` | Per-tool override: `"sequential"` or `"parallel"` |

## AgentToolResult

```typescript
interface AgentToolResult<T> {
  content: TextContent[];
  details: T;
  terminate?: boolean;
}
```

| Field | Description |
|-------|-------------|
| `content` | Text content returned to the model |
| `details` | Arbitrary structured details for logs or UI |
| `terminate` | Hint that the agent should stop after this batch (only when all tools in batch agree) |

## AgentEvent

```typescript
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

## AgentContext

```typescript
interface AgentContext {
  systemPrompt: string;
  messages: AgentMessage[];
  tools?: AgentTool<any>[];
}
```

Snapshot passed into the low-level agent loop.

## AgentState

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];       // Assigning copies the top-level array
  messages: AgentMessage[];       // Assigning copies the top-level array
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

## AgentLoopConfig

Configuration for the low-level agent loop. Extends `SimpleStreamOptions` with:

| Field | Type | Description |
|-------|------|-------------|
| `model` | `Model<any>` | Model for LLM calls |
| `convertToLlm` | `(messages) => Message[]` | Convert AgentMessage[] to LLM Message[] |
| `transformContext` | `(messages, signal?) => Promise<AgentMessage[]>` | Transform context before convertToLlm |
| `getApiKey` | `(provider) => string` | Dynamic API key resolution |
| `providerRequestObserver` | `ProviderRequestObserver` | Observer for LLM request lifecycle |
| `shouldStopAfterTurn` | `(context) => boolean` | Early termination check |
| `prepareNextTurn` | `(signal?) => AgentLoopTurnUpdate` | Turn snapshot update |
| `getSteeringMessages` | `() => AgentMessage[]` | Mid-run message injection |
| `getFollowUpMessages` | `() => AgentMessage[]` | Post-stop message injection |
| `toolExecution` | `"sequential" \| "parallel"` | Tool execution strategy |
| `beforeToolCall` | `(context, signal?) => BeforeToolCallResult` | Pre-execution hook |
| `afterToolCall` | `(context, signal?) => AfterToolCallResult` | Post-execution hook |

## StreamFn

```typescript
type StreamFn = (...args: Parameters<typeof streamSimple>) => ReturnType<typeof streamSimple>;
```

Stream function used by the agent loop. Must not throw for request/model/runtime failures — encode failures in the returned stream.

## ThinkingLevel

```typescript
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

Note: `"xhigh"` is only supported by selected model families. Use model thinking-level metadata from `@tsuuanmi/pi-ai` to detect support.

## ToolExecutionMode

```typescript
type ToolExecutionMode = "sequential" | "parallel";
```

- `"sequential"`: execute tool calls one by one
- `"parallel"`: preflight sequentially, then execute allowed tools concurrently

## QueueMode

```typescript
type QueueMode = "all" | "one-at-a-time";
```

Controls how many queued messages are injected at each drain point.

## Hook Types

### BeforeToolCallResult

```typescript
interface BeforeToolCallResult {
  block?: boolean;
  reason?: string;
}
```

Return `{ block: true }` to prevent tool execution.

### AfterToolCallResult

```typescript
interface AfterToolCallResult {
  content?: TextContent[];
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}
```

Field-by-field override. Omitted fields keep original values. No deep merge.

## ProviderRequestObserver

```typescript
interface ProviderRequestObserver {
  onRequestStart?: (event: ProviderRequestObserverStart) => void | Promise<void>;
  onRequestPayload?: (event: ProviderRequestObserverPayload) => void | Promise<void>;
  onRequestResponse?: (event: ProviderRequestObserverResponse) => void | Promise<void>;
  onRequestComplete?: (event: ProviderRequestObserverComplete) => void | Promise<void>;
}
```

Observer failures are silently ignored and do not affect the loop.