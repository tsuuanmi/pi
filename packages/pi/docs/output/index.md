# Output buffering and truncation

The `src/output/` layer keeps command and tool output bounded for display while preserving enough metadata to diagnose truncation. It is used by execution and tool boundaries; it does not decide how a mode renders the result.

## Limits

The shared defaults are:

- **2,000 lines** (`DEFAULT_MAX_LINES`)
- **50 KiB** (`DEFAULT_MAX_BYTES`)
- **500 characters per grep match line** (`GREP_MAX_LINE_LENGTH`)

The line and byte limits are independent. The first limit reached determines whether output is reported as line- or byte-truncated.

## Direction of truncation

- `truncateHead()` keeps the beginning of output, which is appropriate for file reads and other content where the first lines carry context.
- `truncateTail()` keeps the end of output, which is appropriate for shell commands where failures and final results are usually at the end.
- `truncateLine()` bounds an individual match line and appends `... [truncated]` when necessary.

The truncation result includes original and emitted line/byte counts, the applied limits, the limit that was hit, and edge-case flags. UTF-8 byte boundaries and surrogate pairs are handled without emitting invalid text.

## Streaming output

`OutputBuffer` accepts `Buffer` chunks and decodes them with a streaming UTF-8 decoder. It maintains a bounded rolling tail for snapshots and tracks total raw bytes, decoded bytes, and lines. When output exceeds a configured limit, it can spill the complete raw stream to a temporary file.

```typescript
const buffer = new OutputBuffer({ maxLines: 2000, maxBytes: 50 * 1024 });
buffer.append(chunk);
buffer.finish();

const snapshot = buffer.snapshot({ persistIfTruncated: true });
// snapshot.content: bounded display text
// snapshot.truncation: counts and truncation metadata
// snapshot.fullOutputPath: full output when it was persisted
```

## Sanitization

`sanitizeBinaryOutput()` removes control, format, and invalid characters that can disrupt terminal rendering while preserving tabs, newlines, and carriage returns. Sanitization is separate from truncation so callers can apply the appropriate order for their output path.
