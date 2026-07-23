# Status Line Component

`StatusLineComponent` is the `Component` that renders the configurable segment rail with inline HUD and hook status details. It replaced the older `FooterComponent` (still exported under that alias).

```typescript
class StatusLineComponent implements Component {
  constructor(
    session: StatusLineSessionLike,
    footerData: StatusLineDataProvider,
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

- `session` — the host session (model, thinking level, session manager, context usage, subagents).
- `footerData` — the shared footer data provider (git branch via `.git/HEAD` watch, extension statuses, provider count). The component does **not** own the `.git/HEAD` watcher.
- `settingsSource` — a live handle to the current `StatusLineSettings`; read on every render so config changes take effect immediately.
- `requestRender` — called from background refresh callbacks when a cache updates.
- `options.readHudEntries` — optional async HUD entry reader (see [Types](types.md)).

## Render lifecycle

`render(width)` returns at most one line. HUD output from `renderHudBar` leads when present, then the rail and hook status text are appended inline. The combined line is truncated to `width`; the HUD cache is refreshed in the background (1s interval).

## Background refresh

The component owns two caches, both error-resilient (never throw on the render path):

- **Git porcelain cache** — `git status --porcelain` counts, refreshed every 30s. `invalidate()` bumps a generation counter so a fetch started before a branch switch cannot overwrite the newer cache state.
- **HUD cache** — `readHudEntries({ cwd, sessionId })`, refreshed every 1s. On failure the cache is left unchanged (initially `[]` until a valid read).

Each refresh callback calls `requestRender()` when the cache value changed so the host redraws.

## Rail assembly

- Visible right segments are collected first, then visible left segments.
- Both groups are joined with the separator rendered as `dim " / "` (see [Separators](separators.md)).
- A minimum gap of 2 columns is kept between the groups. If the rail does not fit:
  1. When the `model` segment included a `(provider)` prefix and more than one provider is available, the model segment is re-rendered with `showProviderPrefix: false` and the rail recomputed.
  2. The left group is truncated (with `...`) if it alone exceeds the width.
  3. The right group is omitted entirely when there is no room for the minimum gap, otherwise it is truncated to the available space.

Hook status text is assembled from `footerData.getExtensionStatuses()`, sorted by key, joined with spaces, appended inline after the rail, and truncated with the combined line to `width`.

## See Also

- [Types](types.md) — settings and host interfaces.
- [Segments](segments.md) — what each segment renders.
- [HUD Rendering](../hud/render.md) — inline HUD output.