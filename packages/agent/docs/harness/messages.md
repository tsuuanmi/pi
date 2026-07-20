# Harness Messages

`src/harness/messages.ts` defines harness-only message roles and conversion helpers used before sending context to the LLM.

## Message roles

### `BashExecutionMessage`

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  timestamp: number;
  excludeFromContext?: boolean;
}
```

Converted to a user text message with the command, output, cancellation/exit-code notes, and the full-output path when truncated. If `excludeFromContext` is true, the message is omitted from LLM context.

### `CustomMessage<T = unknown>`

```typescript
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | TextContent[];
  display: boolean;
  details?: T;
  timestamp: number;
}
```

Converted to a user message. String content becomes one text block; `TextContent[]` is passed through.

### `BranchSummaryMessage`

```typescript
interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp: number;
}
```

Converted to a user message wrapped with the branch-summary prefix/suffix constants.

### `CompactionSummaryMessage`

```typescript
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}
```

Converted to a user message wrapped with the compaction-summary prefix/suffix constants.

## Helpers

- `bashExecutionToText(msg)` formats a bash execution message for context.
- `createBranchSummaryMessage(summary, fromId, timestamp)` creates a branch summary message from an ISO timestamp.
- `createCompactionSummaryMessage(summary, tokensBefore, timestamp)` creates a compaction summary message from an ISO timestamp.
- `createCustomMessage(customType, content, display, details, timestamp)` creates a custom message from an ISO timestamp.
- `convertToLlm(messages)` converts `AgentMessage[]` to `@tsuuanmi/pi-ai` `Message[]` by handling the roles above, passing through `user`, `assistant`, and `toolResult`, and dropping unknown/omitted messages.

The module augments `CustomAgentMessages` in `src/agent/types.ts` so these roles are part of the package `AgentMessage` union.
