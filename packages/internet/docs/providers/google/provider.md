# providers/google/provider

Mirrors `src/providers/google/provider.ts`.

Enabled Google accounts register as `gemini-api` for account `default` or `gemini-api-<id>`
otherwise. They use Pi's built-in `openai-completions` transport against Google's documented
`https://generativelanguage.googleapis.com/v1beta/openai` compatibility endpoint and resolve the
credential through `$<apiKeyEnv>`.
