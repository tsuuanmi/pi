# Status Line Segments

The 10 built-in segment renderers, the segment registry, and the shared helpers relocated from the old `footer.ts`.

## Segment registry

```typescript
const SEGMENTS: Record<StatusLineSegmentId, StatusLineSegment>;
function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment;
const ALL_SEGMENT_IDS: StatusLineSegmentId[];
```

`renderSegment` returns `{ content: "", visible: false }` for an unknown id (defensive — ids are typed, but the registry is a `Record`).

## Built-in segments

| id | Renders | Hidden when |
|---|---|---|
| `model` | `(provider) name • level` (dim) | never (falls back to `no-model`) |
| `mode` | the active HUD phase (accent) | no active HUD phase |
| `git` | `branch *unstaged +staged ?untracked` (warning when dirty, dim when clean) | no branch and no status |
| `path` | abbreviated cwd, truncated to `maxLength` (dim) | never |
| `context_pct` | `pct%/window (auto)` colored by usage level | never (renders `?` when percent unknown) |
| `context_total` | `window` tokens (dim) | `contextWindow` is 0 |
| `token_in` | `↑input` (muted) | no input usage |
| `token_out` | `↓output` (muted) | no output usage |
| `session_name` | sanitized session name (accent) | no session name |
| `subagents` | `↳count` (muted) | `subagentCount === 0` |

### `model`

- `name` falls back to `id`, then `no-model`.
- `(provider)` is prefixed only when `availableProviderCount > 1`, `showProviderPrefix !== false`, and a model is present. The component handles the width fallback by re-rendering this segment with the prefix disabled.
- The thinking level is folded in (`name • level`) when `showThinkingLevel !== false` and the model has `reasoning`. `off` is not shown. Each level uses its own `thinking*` theme color (see [Context Thresholds](context-thresholds.md) for the level-to-color mapping of context, and the theme for thinking levels).

### `git`

`branch` comes from the data provider; `status` (staged/unstaged/untracked counts) comes from the porcelain cache. The segment is `warning`-colored when dirty, `dim` when clean. Indicators: `*` unstaged, `+` staged, `?` untracked, shown only when the corresponding count is > 0 and the option is enabled.

### `context_pct`

Renders `pct.toFixed(1)%/window (auto)` where `(auto)` appears only when `autoCompactEnabled`. When the percent is unknown (`null`/non-finite), renders `?` and uses the `normal` color. Color is chosen via [Context Thresholds](context-thresholds.md).

### `path`

Abbreviates the cwd to `~` when inside `$HOME` (`formatCwdForFooter`), then truncates to `maxLength` (default 40) with a leading `…`.

## Shared helpers

```typescript
function sanitizeStatusText(text: string): string;
function formatTokens(count: number): string;
function formatCwdForFooter(cwd: string, home: string | undefined): string;
function computeUsageStats(session: SegmentContext["session"]): { input: number; output: number };
```

- `sanitizeStatusText` — strips ANSI escapes, replaces C0 controls and DEL with spaces, collapses runs, trims. Prevents raw escapes from leaking into the rail.
- `formatTokens` — `<1k` as raw number, `<10k` as `N.Nk`, `<1M` as `Nk`, `<10M` as `N.NM`, else `NM`.
- `formatCwdForFooter` — resolves cwd/home and replaces the home prefix with `~`; returns the cwd unchanged when home is unset or cwd is outside it.
- `computeUsageStats` — sums `input`/`output` usage across all assistant message entries in the session.

## See Also

- [Types](types.md) — `SegmentContext`, `StatusLineSegmentOptions`.
- [Context Thresholds](context-thresholds.md) — context-usage colors.