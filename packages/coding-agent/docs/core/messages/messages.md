# Messages

Agent message types, custom message construction, and context optimization for coding agent sessions.

## Overview

Pi uses a rich message type system that extends the base `AgentMessage` types from `@tsuuanmi/pi-agent` with coding-agent-specific message types. Custom messages are transformed to LLM-compatible messages via `convertToLlm()`.

## Custom Message Types

Pi extends the base agent message types with four custom message roles:

### BashExecutionMessage

Messages representing `!` command executions in the conversation:

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;           // The shell command that was run
  output: string;           // Command output (possibly truncated)
  exitCode: number | undefined;
  cancelled: boolean;       // Whether the command was cancelled
  truncated: boolean;       // Whether output was truncated
  fullOutputPath?: string;  // Path to full output if truncated
  timestamp: number;
  excludeFromContext?: boolean; // If true, excluded from LLM context (!! prefix)
}
```

When transformed to LLM context, bash executions become user messages with formatted output. Messages marked `excludeFromContext` are dropped entirely.

### CustomMessage

Messages injected by extensions via `sendMessage()`:

```typescript
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;                // Extension-defined type identifier
  content: string | TextContent[];   // Message content
  display: boolean;                  // Whether to render in the TUI
  details?: T;                       // Optional structured data
  timestamp: number;
}
```

Custom messages become user messages in LLM context.

### CompactionSummaryMessage

Summary generated when conversation context is compacted:

```typescript
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;       // The compaction summary text
  tokensBefore: number;  // Token count before compaction
  timestamp: number;
}
```

Compaction summaries are wrapped in `<summary>` tags when sent to the LLM.

### BranchSummaryMessage

Summary of a conversation branch when navigating the conversation tree:

```typescript
interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;    // The branch summary text
  fromId: string;     // Branch origin message ID
  timestamp: number;
}
```

Branch summaries are wrapped in `<summary>` tags when sent to the LLM.

## Message Creation

```typescript
import {
  createCompactionSummaryMessage,
  createBranchSummaryMessage,
  createCustomMessage,
} from "@tsuuanmi/pi-coding-agent";

const compaction = createCompactionSummaryMessage(summary, tokensBefore, timestamp);
const branch = createBranchSummaryMessage(summary, fromId, timestamp);
const custom = createCustomMessage("myType", content, true, details, timestamp);
```

## LLM Conversion

`convertToLlm(messages)` transforms an array of `AgentMessage` (including custom types) into an array of LLM-compatible `Message` objects:

| Input Role | Output | Notes |
|------------|--------|-------|
| `user` | `user` | Passed through unchanged |
| `assistant` | `assistant` | Passed through unchanged |
| `toolResult` | `toolResult` | Passed through unchanged |
| `bashExecution` | `user` | Formatted as "Ran `command`" with output block. Skipped if `excludeFromContext` |
| `custom` | `user` | String content wrapped as text; `TextContent[]` passed through |
| `branchSummary` | `user` | Wrapped in `<summary>` tags with prefix |
| `compactionSummary` | `user` | Wrapped in `<summary>` tags with prefix |

## Retained Context Optimization

The `context-optimization` module provides replay-only optimization of retained context (messages kept in the conversation window). This is distinct from compaction (which removes messages entirely) — context optimization replaces or compresses messages in-place to reduce token usage.

### How It Works

`optimizeRetainedContext(messages, options)` applies a series of transformations:

1. **Thinking block stripping** — Removes plain readable thinking blocks from assistant messages, preserving redacted/signed thinking for continuity
2. **Bash output compression** — Truncates oversized bash outputs, keeping a head/tail with a compression marker showing bytes/lines omitted
3. **Read result deduplication** — Replaces older content-identical `read` tool results with deterministic summary records
4. **Stale tool result summarization** — Summarizes old non-error `read`, `bash`, and `edit` results when total retained bytes exceed budget

### Options

```typescript
interface RetainedContextOptimizationOptions {
  stripThinking: boolean;              // Strip removable thinking blocks (default: true)
  compressBashOutput: boolean;          // Compress oversized bash outputs (default: true)
  bashMaxBytes: number;                 // UTF-8 byte budget for bash output compression (default: 16384)
  dedupeReadResults: boolean;           // Deduplicate content-identical read results (default: true)
  summarizeStaleToolResults: boolean;   // Summarize stale tool results over budget (default: true)
  toolResultMaxBytes: number;           // Best-effort budget for retained tool-result bytes (default: 96000)
  cwd?: string;                         // Working directory for path normalization
}
```

### Protection Rules

Not all tool results are eligible for optimization:

- **Current/unconsumed batches** — The latest assistant tool-call batch and any unconsumed batch are always kept raw
- **Recent consumed batches** — The last 2 consumed assistant–tool-result batches are protected
- **Error results** — Tool results with `isError: true` are never summarized
- **Already summarized** — Results that are already Pi retained summaries are not re-summarized

### Read Deduplication

Duplicate read deduplication requires matching:
- Normalized path (relative paths resolved to absolute)
- Offset and limit parameters
- SHA-256 hash of content
- Byte count

Same-path reads with different output fail open and remain raw. The newest duplicate is kept; older duplicates are replaced with summary records.

### Summary Records

Optimized tool results are replaced with structured JSON summary records:

```json
{
  "toolName": "read",
  "toolCallId": "call_abc123",
  "path": "/absolute/path/to/file",
  "offset": 1,
  "limit": 50,
  "originalBytes": 12000,
  "originalLines": 50,
  "originalSha256": "abc...",
  "policy": "read_duplicate",
  "retainedByPolicy": "newest_duplicate",
  "duplicateOfToolCallId": "call_def456"
}
```

These are wrapped in `[Pi retained tool-result summary v1]` / `[/Pi retained tool-result summary]` markers.

### Bash Compression

Bash output compression keeps a head and tail of the original output with a marker showing the omitted bytes and lines:

```
[initial output][Pi retained-context compression: omitted 50000 bytes / 200 lines from bash output. Full output: /path/to/file.] [trailing output]
```

## See Also

- [Session Format](../session-manager/session-format.md) - Message serialization format
- [Compaction](../compaction/compaction.md) - Full context compaction
- [Extensions](../extensions/extensions.md) - Creating and handling custom message types