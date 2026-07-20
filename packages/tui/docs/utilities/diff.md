# Diff Rendering

`renderDiff` renders a unified-style diff string with colored context/added/removed lines and intra-line change highlighting.

```typescript
interface DiffRenderTheme {
  context(text: string): string;
  removed(text: string): string;
  added(text: string): string;
  inverse(text: string): string;
}
interface RenderDiffOptions {
  filePath?: string;   // unused, kept for API compatibility
  theme?: DiffRenderTheme;
}
function renderDiff(diffText: string, options?: RenderDiffOptions): string;
```

## Default theme

When `theme` is omitted, colors are pulled from the active [Theme](../theme/index.md):

- `context` → `toolDiffContext`
- `removed` → `toolDiffRemoved`
- `added` → `toolDiffAdded`
- `inverse` → `theme.inverse`

## Line parsing

Each line is parsed as `^([+-\s])(\s*\d*)\s(.*)$` into `{ prefix, lineNum, content }`. Unparseable lines are emitted as context.

## Rendering

- **Removed runs** (`-`) and **added runs** (`+`) are collected in consecutive groups.
- When a group is exactly one removed line followed by one added line (a single line modification), `renderIntraLineDiff` runs a word-level diff (`diff` package's `diffWords`) and applies `theme.inverse` to the changed tokens. Leading whitespace is stripped from the inverse span so indentation is not highlighted.
- Otherwise (multi-line add/remove), each line is emitted in full: removed lines first, then added lines.
- Standalone added lines and context lines are emitted directly.
- Tabs are replaced with three spaces before rendering for consistent column alignment.

## See Also

- [Theme](../theme/index.md) — the default diff colors (`toolDiff*`).