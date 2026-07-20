# Status Line Presets

Built-in `default` and `custom` presets. Only the 10 Pi segment ids are used; `thinking` is a folded option of `model`, not a separate segment.

```typescript
const STATUS_LINE_PRESETS: Record<StatusLinePreset, PresetDef>;
function getPreset(name: StatusLinePreset | undefined): PresetDef;
```

`getPreset` falls back to `default` for unknown/undefined names, so adding a new preset name is a non-breaking change.

## `default`

```jsonc
{
  "leftSegments":  ["model", "mode", "git", "path"],
  "rightSegments": ["session_name", "subagents", "token_in", "token_out", "context_pct", "context_total"],
  "separator": "slash",
  "segmentOptions": {
    "model": { "showThinkingLevel": true, "showProviderPrefix": true },
    "path":  { "abbreviate": true, "maxLength": 40, "stripWorkPrefix": false },
    "git":   { "showBranch": true, "showStaged": true, "showUnstaged": true, "showUntracked": true }
  }
}
```

## `custom`

`custom` mirrors `default` exactly. It is the home for user overrides applied via the other `StatusLineSettings` fields (`leftSegments`/`rightSegments`/`separator`/`segmentOptions`). Selecting the `custom` preset without overriding any other field therefore looks identical to `default`.

## See Also

- [Types](types.md) — `PresetDef`, `StatusLinePreset`.
- [Component](status-line.md) — how settings are merged over the resolved preset.