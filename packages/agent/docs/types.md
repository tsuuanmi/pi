# Types

Core type definitions for `@tsuuanmi/pi-agent`. Typebox (`typebox`) is used for tool parameter schemas; `Message`, `Model`, `AssistantMessage`, `AssistantMessageEvent`, `TextContent`, `Tool`, and `ToolResultMessage` are re-exported from `@tsuuanmi/pi-ai`.

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
| `execute` | Execute the tool call. Throw on failure instead of encoding errors in `content`. |
| `executionMode` | Per-tool override: `"sequential"` or `"parallel"` |

`Tool<TParameters>` from `@tsuuanmi/pi-ai` supplies `name`, `description`, optional `promptSnippet`, optional `promptGuidelines[]`, and `parameters: TParameters`.

### AgentToolUpdateCallback

```typescript
type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;
```

Scoped to the current `execute()` invocation; calls made after the tool promise settles are ignored.

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

## AgentToolCall

```typescript
type AgentToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
```

A single tool-call content block emitted by an assistant message.

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
| `shouldStopAfterTurn` | `(context: ShouldStopAfterTurnContext) => boolean` | Early termination check (called after `turn_end`; returns true to stop before polling steering/follow-up) |
| `prepareNextTurn` | `(context: PrepareNextTurnContext) => AgentLoopTurnUpdate \| undefined` | Return replacement context/model/thinking state for the next turn |
| `getSteeringMessages` | `() => Promise<AgentMessage[]>` | Mid-run message injection (after tool calls finish) |
| `getFollowUpMessages` | `() => Promise<AgentMessage[]>` | Post-stop message injection |
| `toolExecution` | `"sequential" \| "parallel"` | Tool execution strategy (default `"parallel"`) |
| `beforeToolCall` | `(context: BeforeToolCallContext, signal?) => Promise<BeforeToolCallResult \| undefined>` | Pre-execution hook (after argument validation) |
| `afterToolCall` | `(context: AfterToolCallContext, signal?) => Promise<AfterToolCallResult \| undefined>` | Post-execution hook (before `tool_execution_end`) |

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

## Hook context types

### BeforeToolCallContext

```typescript
interface BeforeToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;          // validated arguments for the target tool schema
  context: AgentContext;  // current agent context at prepare time
}
```

### AfterToolCallContext

```typescript
interface AfterToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;
  result: AgentToolResult<any>;  // executed tool result before overrides
  isError: boolean;
  context: AgentContext;          // current agent context at finalize time
}
```

### ShouldStopAfterTurnContext

```typescript
interface ShouldStopAfterTurnContext {
  message: AssistantMessage;        // assistant message that completed the turn
  toolResults: ToolResultMessage[]; // passed to the preceding turn_end event
  context: AgentContext;            // context after the turn's messages were appended
  newMessages: AgentMessage[];      // messages this loop invocation will return if it exits now
}
```

`PrepareNextTurnContext` extends `ShouldStopAfterTurnContext`.

## Hook result types

### BeforeToolCallResult

```typescript
interface BeforeToolCallResult {
  block?: boolean;
  reason?: string;
}
```

Return `{ block: true }` to prevent tool execution; the loop emits an error tool result with `reason` (or a default message).

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

## AgentLoopTurnUpdate

```typescript
interface AgentLoopTurnUpdate {
  context?: AgentContext;
  model?: Model<any>;
  thinkingLevel?: ThinkingLevel;
}
```

Replacement runtime state applied before the next provider request. Return `undefined` to keep current values.

## ProviderRequestObserver

```typescript
interface ProviderRequestObserver {
  onRequestStart?: (event: ProviderRequestObserverStart) => void | Promise<void>;
  onRequestPayload?: (event: ProviderRequestObserverPayload) => void | Promise<void>;
  onRequestResponse?: (event: ProviderRequestObserverResponse) => void | Promise<void>;
  onRequestComplete?: (event: ProviderRequestObserverComplete) => void | Promise<void>;
}
```

Event payloads:

| Event | Fields |
|-------|--------|
| `ProviderRequestObserverStart` | `requestId`, `requestSequence`, `model`, `context`, `startedAt` |
| `ProviderRequestObserverPayload` | start fields + `payload` |
| `ProviderRequestObserverResponse` | start fields + `response` (`ProviderResponse`) |
| `ProviderRequestObserverComplete` | start fields + `completedAt`, `durationMs`, optional `message`, optional `error`, `aborted` |

Observer failures are silently ignored and do not affect the loop.
