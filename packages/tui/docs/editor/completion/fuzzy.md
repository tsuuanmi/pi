# Fuzzy Matching

Fuzzy string matching for autocomplete and search.

## `fuzzyMatch()`

```typescript
import { fuzzyMatch } from "@tsuuanmi/pi-tui";

const result = fuzzyMatch("path/to/file.ts", "ptf");
// Returns { matched: true, indices: [0, 4, 8] } or null
```

Matches a query against a target string using fuzzy matching. Characters in the query must appear in order in the target, but not necessarily contiguously.

Returns an object with `matched: true` and `indices` of matched positions, or `null` if no match.

## Use Cases

- File path completion in editors
- Command palette search
- Autocomplete filtering

## See Also

- [Autocomplete](autocomplete.md) - `CombinedAutocompleteProvider`