# Status Line Component

`StatusLineComponent` renders the configurable segment rail with inline HUD and hook status details.

```typescript
class StatusLineComponent implements Component {
  constructor(
    session: StatusLineSessionLike,
    dataProvider: StatusLineDataProvider,
    settingsSource: { getStatusLine(): StatusLineSettings },
    requestRender: () => void,
    options?: StatusLineComponentOptions,
  );
  setSession(session: StatusLineSessionLike): void;
  setAutoCompactEnabled(enabled: boolean): void;
  invalidate(): void;
  dispose(): void;
  render(width: number): string[];
}
```

## Construction

- `session` — the host session (model, thinking level, session manager, and context usage).
- `dataProvider` — host-owned repository, extension-status, and provider-count snapshots. The component does not execute Git, watch repository files, or poll repository state.
- `settingsSource` — a live handle to the current `StatusLineSettings`; read on every render so config changes take effect immediately.
- `requestRender` — called from background refresh callbacks when a cache updates.
- `options.readHudEntries` — optional async HUD entry reader (see [Types](types.md)).

## Render lifecycle

`render(width)` returns at most one line. HUD output from `renderHudBar` leads when present, then the rail and hook status text are appended inline. When the combined content is too wide, the right rail group is kept visible and the HUD/left content is shortened first. The HUD cache is refreshed in the background (1s interval).

## Background refresh

The component owns only the HUD cache: `readHudEntries({ cwd, sessionId })` is refreshed every second. On failure the cache remains unchanged (initially `[]` until a valid read). Repository failures and refresh timing are owned by the host data provider.

A changed HUD cache calls `requestRender()` so the host redraws.

## Rail assembly

- Visible right segments are collected first, then visible left segments.
- Both groups are joined with the separator rendered as `dim " / "` (see [Separators](separators.md)).
- A minimum gap of 2 columns is kept between the groups. If the combined line does not fit, HUD and left-side content are shortened before the right group, which remains right-aligned when possible. If the right group itself is wider than the viewport, it is clipped to the available width.

Hook status text is assembled from `dataProvider.getExtensionStatuses()`, sorted by key, joined with spaces, appended inline after the rail, and shortened when the combined line exceeds `width`.

## See Also

- [Types](types.md) — settings and host interfaces.
- [Segments](segments.md) — what each segment renders.
- [HUD Rendering](../hud/render.md) — inline HUD output.