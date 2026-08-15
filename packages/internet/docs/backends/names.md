# backends/names

Mirrors `src/backends/names.ts`.

`accountProviderName(prefix, accountId)` returns the stable prefix for account `default` and
`<prefix>-<accountId>` for every other account. Backend registration and council model selection
share this one naming rule.
