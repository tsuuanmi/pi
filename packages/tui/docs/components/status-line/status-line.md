# Status Line Component

`StatusLineComponent` renders the configurable status information as separate rows, with HUD and hook status details kept apart from the model/context and environment rows.

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

`render(width)` returns up to three lines: HUD output when present, the model/context row, and the environment row with hook status. Each row is independently truncated to the available width. The HUD cache is refreshed in the background (1s interval).

## Background refresh

The component owns only the HUD cache: `readHudEntries({ cwd, sessionId })` is refreshed every second. On failure the cache remains unchanged (initially `[]` until a valid read). Repository failures and refresh timing are owned by the host data provider.

A changed HUD cache calls `requestRender()` so the host redraws.

## Row assembly

- Model/context and environment segments are collected separately.
- Each row is rendered independently, with segments joined using the configured separator (see [Separators](separators.md)).
- Hook status text shares the environment row.
- The default preset omits `context_total` because `context_pct` already includes the context-window size; this avoids output such as `0.0%/272k (auto) / 272k`.


## See Also

- [Types](types.md) — settings and host interfaces.
- [Segments](segments.md) — what each segment renders.
- [HUD Rendering](../hud/render.md) — HUD row output.