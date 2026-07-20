# HUD (Heads-Up Display)

The HUD renders a single status line above the status rail to surface live extension/plugin state (active phases, progress chips, severity warnings).

The module lives under `src/components/hud/` and is re-exported from the package root.

## Files

- [Model](model.md) — entry and chip shapes, severity, normalization, status flags.
- [Rendering](render.md) — `renderHudBar` styling and truncation.
- [Extension UI](extension-ui.md) — `refreshHudUi` redraw hook for producers.

## Public surface (package root)

- `renderHudBar`
- `refreshHudUi`
- Constructors: `hudChip`, `progressChip`
- Normalizers: `normalizeHudChip`, `normalizeHudSeverity`, `normalizeHudSummary`
- `applyHudStatusFlags`, `formatHudLine`
- Types: `HudChip`, `HudSummary`, `HudSeverity`, `HudLineEntry`, `ActiveHudEntry`

## See Also

- [Status Line](../status-line/index.md) — the component that hosts the HUD line.