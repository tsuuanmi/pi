# Status Line Context Thresholds

Context-usage level detection and the mapping from level to a Pi `ThemeColor`. Ported from gajae-code's `context-thresholds.ts`.

```typescript
type ContextUsageLevel = "normal" | "warning" | "purple" | "error";

function getContextUsageLevel(contextPercent: number | null, contextWindow: number): ContextUsageLevel;
function getContextUsageThemeColor(level: ContextUsageLevel): ThemeColor;
```

## Thresholds

A level trips when `contextPercent` reaches the configured percent threshold.
The context window is ignored so the warning behavior stays consistent across
models with different window sizes.

| Level | Percent threshold |
|---|---|
| `warning` | 50% |
| `purple` | 75% |
| `error` | 100% |

When `contextPercent` is `null`, non-finite, or `<= 0`, no level trips (returns `normal`).

Levels are checked `error` → `purple` → `warning` → `normal`, so the highest tripped level wins.

## Theme color mapping

Pi has no `statusLineContext` token (gajae uses one for `normal`), so the levels map to existing Pi colors:

| Level | `ThemeColor` |
|---|---|
| `normal` | `dim` |
| `warning` | `warning` |
| `purple` | `thinkingHigh` |
| `error` | `error` |

## See Also

- [Segments](segments.md) — `context_pct` uses these thresholds.
