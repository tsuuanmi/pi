# backends/openai/index

Mirrors `src/backends/openai/index.ts`.

Barrel that re-exports the ChatGPT Web backend's public surface:

- `chatGptWebModels` from [`models.ts`](models.md).
- `createOpenAiProviderConfig`, `providerName`, `registerOpenAiProviders` from
  [`provider.ts`](provider.md).
