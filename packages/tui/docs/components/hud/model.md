# HUD Model

Data model and normalization helpers for HUD (heads-up display) entries rendered in the status line HUD bar.

This module is the single source of truth for the HUD wire format that extension status producers write and that `renderHudBar` consumes.

## Severity

```typescript
type HudSeverity = "info" | "warning" | "blocked" | "error" | "success";
```

A single severity value drives both chip color and prefix (`warn:`, `block`, `!`) in the rendered HUD line.

## Shapes

```typescript
interface HudChip {
  label: string;
  value?: string;
  priority?: number;   // lower sorts first (default 100)
  severity?: HudSeverity;
}

interface HudSummary {
  version: 1;           // must be exactly 1; otherwise rejected
  summary?: string;     // single line, sanitized to 120 chars
  chips?: HudChip[];    // up to 6 after normalization
  details?: HudChip[];  // up to 12 after normalization
  severity?: HudSeverity;
  updated_at?: string;
}

interface HudLineEntry {
  id: string;
  phase?: string;
  stale?: boolean;
  hud?: HudSummary;
}

interface ActiveHudEntry extends HudLineEntry {
  active: boolean;
  updated_at?: string;
}
```

`ActiveHudEntry` is the shape `StatusLineComponent` reads via the `readHudEntries` option; only entries with `active !== false` are rendered.

## Constructors

- `hudChip(label, value, priority, severity?)` — build a `HudChip`, coercing `value` to a string.
- `progressChip(done, total, priority = 25)` — convenience `progress` chip formatted as `done/total`.

## Normalization

All functions strip ANSI escape sequences, collapse control whitespace, and truncate labels/values:

- `normalizeHudSeverity(value)` — returns the value only if it is one of the five severities, else `undefined`.
- `normalizeHudChip(value)` — validates a plain object, sanitizes `label` (max 32) and `value` (max 80), and drops the chip when `label` is empty.
- `normalizeHudSummary(value)` — requires `version: 1`; sanitizes `summary` (max 120), normalizes `chips` (max 6) and `details` (max 12), and omits empty fields. Returns `undefined` when the input is not a valid version-1 summary.

Normalization is the boundary between untrusted extension output and the render path; it never throws.

## Status flags

`applyHudStatusFlags(entry, { stale })` — when `stale` is true, marks the entry `stale` and rewrites the HUD severity:

- An existing `error`/`blocked` severity is preserved (still stale, but the severity wins).
- Any other (or missing) severity is forced to `warning`.

## Formatting

`formatHudLine(entry)` — debug-oriented single-line summary: `[stale] id | phase | label=value ...`, sorted by chip priority. Used for logging, not for rendering — `renderHudBar` produces the visible output.

## See Also

- [HUD Rendering](render.md) — turns active entries into a styled line.
- [Extension UI](extension-ui.md) — requesting a host redraw.
- [Status Line](../status-line/index.md) — the component that hosts the HUD bar.