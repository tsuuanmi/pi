# Status Line Separators

Resolve a separator style to its glyph definition.

```typescript
interface SeparatorDef { before: string; after: string; }
function getSeparator(style: StatusLineSeparatorStyle | undefined): SeparatorDef;
```

Only `slash` is rendered today (`{ before: "/", after: "/" }`). Any other value — including future/unknown styles — falls back to `slash`, so adding a new style is a non-breaking change.

Pi's theme has no `sep.*` tokens, so the slash glyph is hardcoded here. The component renders the separator as `dim " / "` between segments (see [Component](status-line.md)).

## See Also

- [Types](types.md) — `StatusLineSeparatorStyle`, `SeparatorDef`.