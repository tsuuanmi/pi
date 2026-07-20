# Status Line Context Thresholds

Context-usage level detection and the mapping from level to a Pi `ThemeColor`. Ported from gajae-code's `context-thresholds.ts`.

```typescript
type ContextUsageLevel = "normal" | "warning" | "purple" | "error";

function getContextUsageLevel(contextPercent: number | null, contextWindow: number): ContextUsageLevel;
function getContextUsageThemeColor(level: ContextUsageLevel): ThemeColor;
```

## Thresholds

A level trips when `contextPercent` reaches `min(percentThreshold, tokenPercentThreshold)`, where `tokenPercentThreshold` is the percent of the context window that `tokenThreshold` tokens occupy. This means a **small context window trips a level via absolute tokens before it trips via percent**.

| Level | Percent threshold | Token threshold |
|---|---|---|
| `warning` | 50% | 150,000 |
| `purple` | 70% | 270,000 |
| `error` | 90% | 500,000 |

When the context window is unknown/invalid (`<= 0` or non-finite), only the percent threshold applies. When the percent is `null`, non-finite, or `<= 0`, no level trips (returns `normal`).

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