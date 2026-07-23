# Visual Truncation

`truncateToVisualLines` truncates text to a maximum number of visual lines from the end, accounting for line wrapping based on terminal width.

```typescript
interface VisualTruncateResult {
  visualLines: string[];
  skippedCount: number;
}
function truncateToVisualLines(
  text: string,
  maxVisualLines: number,
  width: number,
  paddingX?: number,
): VisualTruncateResult;
```

## Behavior

- Returns `{ visualLines: [], skippedCount: 0 }` for empty text.
- Renders the text once via a temporary `Text` component to compute wrapped visual lines.
- If the line count is within the limit, returns everything.
- Otherwise returns the last `maxVisualLines` lines and reports the skipped count.

## `paddingX`

Horizontal padding passed to the temporary `Text` component:

- `0` (default) — use when the result will be placed in a `Box`.
- `1` — use when the result will be placed in a plain container.

## See Also

- [Components](../../components/index.md) — `Text` performs the wrapping.
- [Text Utilities](../../utilities/text.md) — lower-level width and wrapping helpers.
