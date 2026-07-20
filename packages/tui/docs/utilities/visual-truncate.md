# Visual Truncation

`truncateToVisualLines` truncates text to a maximum number of visual lines (from the end), accounting for line wrapping based on terminal width.

```typescript
interface VisualTruncateResult {
  visualLines: string[];   // the visual lines to display
  skippedCount: number;     // number of visual lines hidden
}
function truncateToVisualLines(
  text: string,
  maxVisualLines: number,
  width: number,
  paddingX?: number,   // default 0
): VisualTruncateResult;
```

## Behavior

- Returns `{ visualLines: [], skippedCount: 0 }` for empty text.
- Renders the text once via a temporary `Text` component (see [Components](../components/index.md)) to compute the full set of wrapped visual lines.
- When the line count is `<= maxVisualLines`, returns everything with `skippedCount: 0`.
- Otherwise returns the **last** `maxVisualLines` lines and reports the count of skipped (leading) lines. This keeps the most recent output visible when a buffer scrolls.

## `paddingX`

Horizontal padding passed to the temporary `Text` component:

- `0` (default) — use when the result will be placed in a `Box` (Box adds its own padding).
- `1` — use when the result will be placed in a plain `Container`.

## See Also

- [Components](../components/index.md) — `Text` performs the wrapping.
- [Text Utilities](text.md) — lower-level width/wrapping helpers.