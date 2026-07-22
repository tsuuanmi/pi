# Text Truncation

`src/utils/truncate.ts` provides shared truncation utilities for tool and shell output.

## Constants

```typescript
const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;
const GREP_MAX_LINE_LENGTH = 500;
```

## Types

```typescript
interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

interface TruncationResult {
  content: string;
  truncated: boolean;
  truncatedBy: "lines" | "bytes" | null;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
  lastLinePartial: boolean;
  firstLineExceedsLimit: boolean;
  maxLines: number;
  maxBytes: number;
}
```

Line and byte limits are independent; whichever limit is hit first determines `truncatedBy`. Byte counts are UTF-8 aware.

## Functions

```typescript
formatSize(bytes: number): string;
truncateHead(content: string, options?: TruncationOptions): TruncationResult;
truncateTail(content: string, options?: TruncationOptions): TruncationResult;
truncateLine(line: string, maxChars?: number): { text: string; wasTruncated: boolean };
```

- `formatSize()` renders `B`, `KB`, or `MB` strings.
- `truncateHead()` keeps the beginning of content and never returns partial lines. If the first line alone exceeds `maxBytes`, it returns empty content with `firstLineExceedsLimit: true`.
- `truncateTail()` keeps the end of content for shell output and errors. It may return a partial first output line when the final original line exceeds `maxBytes`.
- `truncateLine()` shortens one line to `maxChars` and appends `... [truncated]`.
