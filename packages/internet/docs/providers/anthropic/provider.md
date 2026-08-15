# providers/anthropic/provider

Mirrors `src/providers/anthropic/provider.ts`.

Enabled Anthropic accounts register as `anthropic-api` for account `default` or
`anthropic-api-<id>` otherwise. Config uses Pi's native `anthropic-messages` transport,
`https://api.anthropic.com`, and `$<apiKeyEnv>` interpolation. The account registry stores only the
environment-variable name.
