# ANSI Utilities

`stripAnsi` removes ANSI escape sequences from a string. Derived from `ansi-regex` / `strip-ansi` (MIT, Sindre Sorhus).

```typescript
function stripAnsi(value: string): string;
```

- Throws `TypeError` when given a non-string.
- Fast path: returns the value unchanged when it contains neither `\u001B` (7-bit ESC) nor `\u009B` (8-bit CSI introducer).
- The regex matches OSC sequences (`ESC ] ... ST`), CSI and related sequences, and handles `;`/`:`-separated parameters and the full set of final bytes.

## See Also

- [Text Utilities](text.md) — higher-level ANSI-aware width/wrapping helpers.