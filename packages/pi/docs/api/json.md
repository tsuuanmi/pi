# JSON Event Stream Mode

```bash
pi --mode json "Your prompt"
```

Outputs all session events as JSON lines to stdout. Useful for integrating pi into other tools or custom UIs.

API usage logging, when enabled, is written only to the sidecar file at `<cwd>/.pi/{encodedSessionId}/state/api-usage.jsonl`; it is never emitted on stdout.

## Event Types

Events are defined in [`AgentSessionEvent`](https://github.com/tsuuanmi/pi/blob/main/packages/pi/src/runtime/session/types.ts#L24):

```typescript
type AgentSessionEvent =
  | SessionAgentEvent
  | (Extract<AgentEvent, { type: "agent_end" }> & { willRetry: boolean })
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string };

type SessionAgentEvent = Extract<
  AgentEvent,
  { type: "agent_start" | "turn_end" | "message_start" | "message_update" | "message_end" | "tool_execution_start" | "tool_execution_update" | "tool_execution_end" | "structured_output" }
>;
```

`queue_update` emits the full pending steering and follow-up queues whenever they change. `session_info_changed` reports session name changes, and `thinking_level_changed` reports the active thinking level. `compaction_start` and `compaction_end` cover both manual and automatic compaction. `structured_output` reports structured-output validation attempts.

The JSON stream intentionally selects the Agent events needed by Pi run modes. Agent diagnostic/status events, `turn_start`, loop detection, and max-turn notifications are available to extension observers through the canonical `ExtensionEvent` stream rather than duplicated into `AgentSessionEvent`.

## Message Types

Base LLM messages from [`packages/ai/src/protocol/message.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/ai/src/protocol/message.ts):
- `UserMessage` (line 8)
- `AssistantMessage` (line 14)
- `ToolResultMessage` (line 30)

Agent message roles from [`packages/agent/src/messages/types.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/agent/src/messages/types.ts):
- `BashExecutionMessage`
- `CustomMessage`
- `BranchSummaryMessage`
- `CompactionSummaryMessage`

## Output Format

Each line is a JSON object. The first line is the session header:

```json
{"type":"session","version":4,"id":"20260627-143522","timestamp":"...","cwd":"/path"}
```

Followed by events as they occur:

```json
{"type":"agent_start"}
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
