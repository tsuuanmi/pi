# Utilities

ANSI-aware text utilities for terminal rendering.

## `visibleWidth`

Calculate the visible width of a string, ignoring ANSI escape codes:

```typescript
import { visibleWidth } from "@tsuuanmi/pi-tui";

const width = visibleWidth("\x1b[31mHello\x1b[0m"); // 5
```

## `truncateToWidth`

Truncate a string to fit within a width, preserving ANSI codes and adding an ellipsis:

```typescript
import { truncateToWidth } from "@tsuuanmi/pi-tui";

const truncated = truncateToWidth("Hello World", 8); // "Hello..."
```

Truncate without ellipsis:

```typescript
const truncated = truncateToWidth("Hello World", 8, ""); // "Hello Wo"
```

`truncateToWidth` properly handles:
- ANSI escape codes (preserved, not counted)
- Multi-byte Unicode characters
- Wide characters (CJK, emoji)
- Proper reset sequences at truncation point

## `wrapTextWithAnsi`

Wrap text to a width, preserving ANSI codes across line breaks:

```typescript
import { wrapTextWithAnsi } from "@tsuuanmi/pi-tui";

const lines = wrapTextWithAnsi("This is a long line that needs wrapping", 20);
// ["This is a long line", "that needs wrapping"]
```

When wrapping, styles from the previous line are re-applied at the start of the next line.

## `sliceByColumn`

Slice a string by visible column position, accounting for wide characters and ANSI codes:

```typescript
import { sliceByColumn } from "@tsuuanmi/pi-tui";

const sliced = sliceByColumn(text, startCol, endCol);
```

## `sliceWithWidth`

Slice a string to a maximum visible width:

```typescript
import { sliceWithWidth } from "@tsuuanmi/pi-tui";

const sliced = sliceWithWidth(text, maxWidth);
```

## `UndoStack`

Generic undo stack with clone-on-push semantics:

```typescript
import { UndoStack } from "@tsuuanmi/pi-tui";

const stack = new UndoStack<{ text: string }>();

// Push a deep clone of state
stack.push({ text: "hello" });

// Pop and return the most recent snapshot
const state = stack.pop(); // { text: "hello" }

// Clear all snapshots
stack.clear();

// Get count
console.log(stack.length); // 0
```

Popped snapshots are returned directly (no re-cloning) since they are already detached.

## `extractSegments` and `normalizeTerminalOutput`

Internal utilities for parsing ANSI-coded terminal output into segments:

```typescript
import { extractSegments, normalizeTerminalOutput } from "@tsuuanmi/pi-tui";
```

These are used internally by the rendering engine and are exported for advanced use cases.

## Word Navigation

Utilities for cursor movement through words:

```typescript
import { findWordBackward, findWordForward } from "@tsuuanmi/pi-tui";

const text = "hello world foo";
const pos1 = findWordBackward(text, 14); // 11 (start of "foo")
const pos2 = findWordForward(text, 0);    // 6 (start of "world")
```

Options:

```typescript
interface WordNavigationOptions {
  /** Custom segmenter returning word segments */
  segment?: (text: string) => Iterable<Intl.SegmentData>;
  /** Predicate identifying atomic segments (e.g., paste markers) */
  isAtomicSegment?: (segment: string) => boolean;
}
```

Word navigation uses `Intl.Segmenter` by default for locale-aware word boundaries, with special handling for:
- Whitespace (skipped)
- Word-like segments (stopping at boundaries)
- Punctuation (treated as separate segments)
- Atomic segments (skipped as a unit, e.g., paste markers)