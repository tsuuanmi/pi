# Compaction

Context compaction and branch summarization for managing conversation context windows.

## Overview

When conversations grow too long for the model's context window, the agent uses compaction to summarize older content while preserving recent work. Compaction replaces a range of entries with a single summary entry.

## Compaction Functions

### `shouldCompact()`

```typescript
function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings,
): boolean
```

Determines whether compaction should occur based on current token usage relative to the context window.

### `compact()`

```typescript
async function compact(
  entries: SessionTreeEntry[],
  cutIndex: number,
  keepFromIndex: number,
  model: Model<any>,
  context: SessionContext,
  settings: CompactionSettings,
  signal?: AbortSignal,
): Promise<CompactionResult>
```

Compacts entries between `cutIndex` and `keepFromIndex` into a summary. Returns a `CompactionResult` with the summary text, tokens before/after, and file operation details.

### `prepareCompaction()`

```typescript
function prepareCompaction(
  entries: SessionTreeEntry[],
  contextWindow: number,
  settings: CompactionSettings,
  usage?: Usage,
): CompactionPreparation | undefined
```

Analyzes entries and returns preparation info (cut point, keep-from index) if compaction is needed. Returns `undefined` if no compaction is needed.

### `calculateContextTokens()`

```typescript
function calculateContextTokens(usage: Usage): number
```

Calculates context token count from provider usage data.

### `estimateContextTokens()`

```typescript
function estimateContextTokens(
  messages: AgentMessage[],
): ContextUsageEstimate
```

Estimates token count from messages when provider usage is unavailable. Returns `{ tokens, details }`.

### `findCutPoint()`

```typescript
function findCutPoint(
  entries: SessionTreeEntry[],
  contextTokens: number,
  contextWindow: number,
  settings: CompactionSettings,
): CutPointResult
```

Finds the optimal cut point for compaction in the session tree.

### `findTurnStartIndex()`

```typescript
function findTurnStartIndex(
  entries: SessionTreeEntry[],
  entryIndex: number,
  startIndex: number,
): number
```

Finds the start index of the turn containing the given entry.

### `serializeConversation()`

```typescript
function serializeConversation(
  messages: AgentMessage[],
  options?: { maxCharacters?: number },
): string
```

Serializes messages to a formatted string for summarization, with optional character truncation.

## CompactionSettings

```typescript
interface CompactionSettings {
  /** Minimum context usage ratio before compaction triggers (default: 0.7) */
  compactAtRatio: number;
  /** Target ratio after compaction (default: 0.5) */
  targetRatio: number;
  /** Minimum entries to keep after compaction (default: 4) */
  minKeepEntries: number;
  /** Whether compaction is enabled (default: true) */
  enabled: boolean;
}
```

Defaults available as `DEFAULT_COMPACTION_SETTINGS`.

## CompactionResult

```typescript
interface CompactionResult<T = unknown> {
  summary: string;
  tokensBefore: number;
  tokensAfter: number;
  details?: T;
}
```

## CompactionDetails

```typescript
interface CompactionDetails {
  /** Files read in the compacted history */
  readFiles: string[];
  /** Files modified in the compacted history */
  modifiedFiles: string[];
}
```

## Branch Summarization

### `generateBranchSummary()`

```typescript
async function generateBranchSummary(
  entries: SessionTreeEntry[],
  model: Model<any>,
  context: SessionContext,
  options?: GenerateBranchSummaryOptions,
): Promise<string>
```

Generates a summary for a branch of the session tree.

### `collectEntriesForBranchSummary()`

```typescript
async function collectEntriesForBranchSummary(
  entries: SessionTreeEntry[],
  branchId: string,
  contextWindow: number,
): Promise<CollectEntriesResult>
```

Collects entries for a branch summary.

### `prepareBranchEntries()`

```typescript
function prepareBranchEntries(
  entries: SessionTreeEntry[],
  tokenBudget: number,
): BranchPreparation
```

Prepares entries for branch summarization within a token budget.