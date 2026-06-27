# Harness Messages

Message construction and conversion utilities for the agent harness.

## Constants

```typescript
const COMPACTION_SUMMARY_PREFIX: string
const COMPACTION_SUMMARY_SUFFIX: string
const BRANCH_SUMMARY_PREFIX: string
const BRANCH_SUMMARY_SUFFIX: string
```

Prefix and suffix markers for compaction and branch summaries in message content.

## Message Types

### `BashExecutionMessage`

```typescript
interface BashExecutionMessage {
  command: string;
  output: string;
  exitCode: number;
  workingDirectory?: string;
}
```

### `CustomMessage`

```typescript
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | TextContent[];
  display?: string;
  details?: T;
  timestamp: string;
}
```

### `BranchSummaryMessage`

```typescript
interface BranchSummaryMessage {
  role: "assistant";
  content: TextContent[];
  fromId: string;
  timestamp: string;
}
```

### `CompactionSummaryMessage`

```typescript
interface CompactionSummaryMessage {
  role: "assistant";
  content: TextContent[];
  tokensBefore: number;
  timestamp: string;
}
```

## Message Construction

### `createBranchSummaryMessage()`

```typescript
function createBranchSummaryMessage(
  summary: string,
  fromId: string,
  timestamp: string,
): BranchSummaryMessage
```

### `createCompactionSummaryMessage()`

```typescript
function createCompactionSummaryMessage(
  summary: string,
  tokensBefore: number,
  timestamp: string,
): CompactionSummaryMessage
```

### `createCustomMessage()`

```typescript
function createCustomMessage(
  customType: string,
  content: string | TextContent[],
  display?: string,
  details?: unknown,
  timestamp?: string,
): CustomMessage
```

### `bashExecutionToText()`

```typescript
function bashExecutionToText(msg: BashExecutionMessage): string
```

Converts a bash execution message to displayable text.

## `convertToLlm()`

```typescript
function convertToLlm(messages: AgentMessage[]): Message[]
```

Converts `AgentMessage[]` to `Message[]` suitable for LLM providers. Filters and transforms custom message types, compaction summaries, and branch summaries into provider-compatible formats.