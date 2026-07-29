# model

Mirrors `src/model/`.

## Files

- `catalog.ts` - generated model registry access, cost calculation, thinking-level support, and model equality.
- `config.ts` - TypeBox schemas for custom provider/model config and model override merging.
- `generated.ts` - generated static model data. Do not edit directly.
- `index.ts` - `Model` type and provider compatibility flags.
- `request.ts` - request option type re-exports.
- `response.ts` - response, usage, diagnostics, and context-overflow helpers.

## Model shape

`Model<TApi>` describes an individual provider model:

- `id`, `name`, `provider`, `api`, and `baseUrl` identify where requests go.
- `reasoning` and `thinkingLevelMap` describe supported reasoning levels.
- `cost` stores per-million-token input, output, cache-read, and cache-write prices.
- `contextWindow` and `maxTokens` describe capacity.
- `headers` and API-specific `compat` tune provider behavior.

Compatibility flags are API-specific:

- `OpenAICompletionsCompat`
- `OpenAIResponsesCompat`
- `AnthropicMessagesCompat`

## Catalog helpers

Use `getModel(provider, modelId)` for generated models, `getModels(provider)` for all models under a provider, and `getModelProviders()` for known providers. `calculateCost(model, usage)` fills `usage.cost` from token counts and model rates. `modelsAreEqual(a, b)` compares provider and id.

Reasoning helpers:

- `getSupportedThinkingLevels(model)` returns the available levels.
- `clampThinkingLevel(model, level)` maps unsupported requested levels to the nearest supported level.

## Config

`ModelsConfigSchema` validates custom model configuration:

```ts
type ModelsConfig = {
  providers?: Record<string, {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    api?: string;
    headers?: Record<string, string>;
    authHeader?: boolean;
    models?: ModelDefinition[];
    modelOverrides?: Record<string, ModelOverride>;
  }>;
};
```

`applyModelOverride(model, override)` merges supported override fields without replacing unspecified nested cost fields. `mergeModelCompat()` merges provider compatibility overrides.

## Responses

`isContextOverflow(message, contextWindow)` detects likely context-window errors from provider error text or a length stop with no output tokens and near-full input usage. It intentionally excludes rate-limit and throttling errors.
