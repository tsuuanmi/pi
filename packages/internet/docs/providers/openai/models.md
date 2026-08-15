# providers/openai/models

Mirrors `src/providers/openai/models.ts`.

Capability-scoped model metadata derived from daemon capabilities.

All routes use concise provider-local ids (`light`, `medium`, `high`, `extra-high`, `pro`, or
`luna`), zero cost, and `input: ["text", "image"]` with `reasoning: true`. Request adaptation maps
the local id to the daemon's canonical `chatgpt-web/<id>` route.

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
- `112_193` for `pro`, otherwise `111_193` for the standard routes when `proAvailable` is true.

### Thinking levels

Each model maps its single reasoning level to a `thinkingLevelMap` entry; all other levels map to
`null` (unsupported). The reasoning levels come from the route definitions in
[`turn/model.md`](turn/model.md).
