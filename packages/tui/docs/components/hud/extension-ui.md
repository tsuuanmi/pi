# HUD Extension UI

`refreshHudUi` is the host-facing hook HUD producers use to ask Pi for a redraw without adding visible status text.

```typescript
function refreshHudUi(ctx: { ui?: { setStatus?: (key: string, text: string | undefined) => void } }): Promise<void>;
```

It clears the private `__hud_refresh__` status key. Pi's extension UI controller treats status updates as a render trigger, so this is a generic "please redraw" signal for HUD producers that do not own a render loop.

The function is async and never rejects; callers can fire-and-forget it.

## See Also

- [HUD Model](model.md) — producing the entries that get rendered on redraw.
- [Status Line](../status-line/status-line.md) — the component that reads HUD entries on each render.