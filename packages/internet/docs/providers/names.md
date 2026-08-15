# providers/names

Mirrors `src/providers/names.ts`.

`accountProviderName(prefix, accountId)` returns the stable prefix for account `default` and
`<prefix>-<accountId>` for every other account. Provider registration and council model selection
share this one naming rule.
