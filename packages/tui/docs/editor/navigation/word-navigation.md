# Word Navigation

Pure cursor-movement helpers for moving one word backward/forward across text. Used by the built-in `Editor` for vim-like word motions.

```typescript
interface WordNavigationOptions {
  segment?: (text: string) => Iterable<Intl.SegmentData>;
  isAtomicSegment?: (segment: string) => boolean;
}

function findWordBackward(text: string, cursor: number, options?: WordNavigationOptions): number;
function findWordForward(text: string, cursor: number, options?: WordNavigationOptions): number;
```

## Behavior

Both functions return a new cursor index and never mutate any state.

### `findWordBackward`

1. Skip trailing whitespace (from the end of the slice before `cursor`).
2. If the last segment is atomic (`isAtomicSegment`), skip exactly that one segment.
3. If the last segment is word-like, skip inside it but preserve ASCII punctuation boundaries — stop just after the last punctuation run inside the segment.
4. Otherwise (non-word, non-whitespace) skip the trailing run of punctuation.

Returns 0 when `cursor <= 0`.

### `findWordForward`

1. Skip leading whitespace (from the slice after `cursor`).
2. If the next segment is atomic, skip exactly that one segment.
3. If the next segment is word-like, skip up to the first ASCII punctuation inside it (or the whole segment when there is none).
4. Otherwise skip the leading run of punctuation.

Returns `text.length` when `cursor >= text.length`.

## Defaults

When `segment` is omitted, the module's cached `Intl.Segmenter` (word granularity) is used (see [Text Utilities](../../utilities/text.md) → `getWordSegmenter`). `isAtomicSegment` defaults to "no atomic segments" — callers like the editor use it to treat paste markers as single units.

## See Also

- [Text Utilities](../../utilities/text.md) — `getWordSegmenter`, `isWhitespaceChar`, `PUNCTUATION_REGEX`.