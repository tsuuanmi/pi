# Status Line

The status line is the configurable one-line bottom rail that can inline HUD and hook status details. It replaced the older `FooterComponent` (still exported under that alias for compatibility).

The module lives under `src/components/status-line/` and is re-exported from the package root.

## Files

- [Types](types.md) — `StatusLineSettings`, `StatusLineSegmentId`, segment/preset/separator definitions, and the host interfaces (`StatusLineSessionLike`, `StatusLineDataProvider`).
- [Component](status-line.md) — `StatusLineComponent`: render lifecycle, background refresh caches, rail assembly.
- [Segments](segments.md) — the 10 built-in segment renderers and shared helpers (`formatTokens`, `formatCwdForFooter`, `computeUsageStats`, `sanitizeStatusText`).
- [Context Thresholds](context-thresholds.md) — context-usage level thresholds and theme color mapping.
- [Presets](presets.md) — `default` and `custom` presets.
- [Separators](separators.md) — separator glyph resolution.
- [Git Utils](git-utils.md) — `git status --porcelain` parsing.

## Public surface (package root)

The package re-exports the module's public API. Notable members:

- `StatusLineComponent` (and `FooterComponent` alias)
- `STATUS_LINE_PRESETS`, `getPreset`
- `SEGMENTS`, `ALL_SEGMENT_IDS`, `renderSegment`
- `getSeparator`
- `getContextUsageLevel`, `getContextUsageThemeColor`
- `parseStatusPorcelain`, `runGitStatusPorcelain`
- Type aliases: `StatusLineSettings`, `StatusLineSegmentId`, `StatusLineSegmentOptions`, `StatusLinePreset`, `SegmentContext`, `RenderedSegment`, `StatusLineHudEntry`, `StatusLineHudEntryReader`, ...

## Layout

Each render produces at most one line. Active HUD details lead the line when present, followed by the rail and hook status text when space allows; the combined line is truncated to the viewport width.

## See Also

- [HUD](../hud/index.md) — the HUD model and rendering backing inline HUD output.
- [Components](../index.md) — other built-in components.