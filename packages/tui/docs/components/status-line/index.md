# Status Line

The status line is the configurable bottom rail that renders HUD, model/context, and environment information on separate rows.

The module lives under `src/components/status-line/` and is re-exported from the package root.

## Files

- [Types](types.md) — `StatusLineSettings`, `StatusLineSegmentId`, segment/preset/separator definitions, and the host interfaces (`StatusLineSessionLike`, `StatusLineDataProvider`).
- [Component](status-line.md) — `StatusLineComponent`: render lifecycle, background refresh caches, and row assembly.
- [Segments](segments.md) — the 10 built-in segment renderers and shared helpers (`formatTokens`, `formatCwd`, `computeUsageStats`, `sanitizeStatusText`).
- [Context Thresholds](context-thresholds.md) — context-usage level thresholds and theme color mapping.
- [Presets](presets.md) — `default` and `custom` presets.
- [Separators](separators.md) — separator glyph resolution.

## Public surface (package root)

The package re-exports the module's public API. Notable members:

- ``StatusLineComponent`
- `STATUS_LINE_PRESETS`, `getPreset`
- `SEGMENTS`, `ALL_SEGMENT_IDS`, `renderSegment`
- `getSeparator`
- `getContextUsageLevel`, `getContextUsageThemeColor`
- Type aliases: `GitStatusSummary`, `StatusLineSettings`, `StatusLineSegmentId`, `StatusLineSegmentOptions`, `StatusLinePreset`, `SegmentContext`, `RenderedSegment`, `StatusLineHudEntry`, `StatusLineHudEntryReader`, ...

## Layout

Each render produces up to three rows. Active HUD details lead when present, followed by the model/context row and the Git/path environment row. Each row is truncated independently to the viewport width.

## See Also

- [HUD](../hud/index.md) — the HUD model and rendering backing the HUD row.
- [Components](../index.md) — other built-in components.