# backends/openai/models

Mirrors `src/backends/openai/models.ts`.

Capability-scoped model metadata derived from daemon capabilities.

All routes use zero cost and support `input: ["text", "image"]` with `reasoning: true`.

## `chatGptWebModels`

```ts
chatGptWebModels(capabilities: DaemonCapabilities): ProviderModelConfig[]
```

- If `capabilities.solAvailable` is false, returns only the Luna model (a single, low-effort,
  large-context route).
- Otherwise returns every model route filtered by `requiresPro` against `capabilities.proAvailable`.

### Context windows

`contextWindow` for a route is:

- `route.contextWindow` for the Luna route, or whenever `proAvailable` is false.
- `112_193` for `chatgpt-web/pro`, otherwise `111_193` for the standard routes when `proAvailable`
  is true.

### Thinking levels

Each model maps its single reasoning level to a `thinkingLevelMap` entry; all other levels map to
`null` (unsupported). The reasoning levels come from the route definitions in
[`turn/model.md`](turn/model.md).
