# JSON Event Stream Mode

```bash
pi --mode json "Your prompt"
```

Outputs all session events as JSON lines to stdout. Useful for integrating pi into other tools or custom UIs.

API usage logging, when enabled, is written only to the sidecar file at `<cwd>/.pi/{encodedSessionId}/api-usage.jsonl`; it is never emitted on stdout.

## Event Types

Events are defined in [`AgentSessionEvent`](https://github.com/tsuuanmi/pi/blob/main/packages/pi/src/runtime/agent-session.ts#L138):

```typescript
type AgentSessionEvent =
  | Exclude<AgentEvent, { type: "agent_end" }>
  | { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "structured_output"; ok: boolean; attempt: number; error?: string; issues?: string[]; preview?: string };
```

`queue_update` emits the full pending steering and follow-up queues whenever they change. `session_info_changed` reports session name changes, and `thinking_level_changed` reports the active thinking level. `compaction_start` and `compaction_end` cover both manual and automatic compaction. `structured_output` reports structured-output validation attempts.

Base events from [`AgentEvent`](https://github.com/tsuuanmi/pi/blob/main/packages/agent/src/runtime/events.ts#L15):

```typescript
type AgentEvent =
  // Agent lifecycle and diagnostics
  | { type: "agent_start" }
  | { type: "agent_status"; status: AgentStatus; trace?: AgentTraceEvent }
  | { type: "runtime_trace"; trace: AgentTraceEvent }
  | { type: "runtime_warning"; warning: { code: string; message: string; details?: Record<string, unknown> } }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "loop_detected"; result: LoopDetectionResult }
  | { type: "max_turns_reached"; turns: number; maxTurns: number }
  // Turn lifecycle
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  // Structured output
  | { type: "structured_output"; ok: boolean; attempt: number; error?: string; issues?: string[]; preview?: string }
  // Message lifecycle
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  // Tool execution
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean; meta: ToolExecutionMeta };
```

## Message Types

Base messages from [`packages/ai/src/protocol/message.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/ai/src/protocol/message.ts):
- `UserMessage` (line 8)
- `AssistantMessage` (line 14)
- `ToolResultMessage` (line 30)

Extended messages from [`packages/agent/src/messages/messages.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/agent/src/messages/messages.ts):
- `BashExecutionMessage`
- `CustomMessage`
- `BranchSummaryMessage`
- `CompactionSummaryMessage`

## Output Format

Each line is a JSON object. The first line is the session header:

```json
{"type":"session","version":3,"id":"20260627-143522","timestamp":"...","cwd":"/path"}
```

Followed by events as they occur:

```json
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"assistant","content":[],...}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
{"type":"message_end","message":{...}}
{"type":"turn_end","message":{...},"toolResults":[]}
{"type":"agent_end","messages":[...],"willRetry":false}
```

## Example

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```
