# HUD Rendering

`renderHudBar` renders the active HUD entries as compact styled text that `StatusLineComponent` can append inline after the status rail.

```typescript
function renderHudBar(entries: readonly StatusLineHudEntry[], width: number): string | null;
```

## Behavior

- Filters to entries with `active !== false` and a non-empty sanitized `id`.
- Sorts entries by `id`, then by `phase`.
- Each entry is rendered as `id  summary  chip  chip ...`, where chips are sorted by `priority` (default 50) then `label`.
- Entries are joined with a dim ` + ` separator.
- The whole line is truncated to `width` with an ellipsis (`…`) when it does not fit. Returns `null` when there are no visible active entries or `width <= 0`.

## Styling

Rendering is self-contained: it emits raw ANSI SGR sequences (it does not depend on `theme`) so the HUD bar looks identical regardless of the active Pi theme.

- `id` — bold accent.
- `summary` — bold accent value.
- Chip label — dim, prefixed by severity (`warn:`, `block`, `!`).
- Chip value — bold, colored by severity (`error` red, `blocked` magenta, `warning` yellow, `success` green, default accent).
- A stale entry gets a leading dim `warn:stale` chip.

All chip/summary text is sanitized (ANSI stripped, control whitespace collapsed) before styling so producer-supplied escapes never leak through.

## See Also

- [HUD Model](model.md) — entry and chip shapes, normalization.
- [Status Line](../status-line/status-line.md) — calls `renderHudBar` once per render.