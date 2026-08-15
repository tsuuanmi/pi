# providers/openai/turn/model

Mirrors `src/providers/openai/turn/model.ts`.

Provider-local model definitions and their canonical daemon route mapping.

## Constants

- `CHATGPT_WEB_PROVIDER` — `"chatgpt-web"`.
- `CHATGPT_WEB_LUNA_MODEL_ROUTE` — the Luna route: provider-local id `luna`, daemon id
  `chatgpt-web/luna`, reasoning `low`, no Pro requirement, context window `1_050_000`.
- `CONSERVATIVE_MAX_OUTPUT_TOKENS` — `16_384`, used as `maxTokens` for every route.

## Types

- `ChatGptWebModelId` — `"light" | "medium" | "high" | "extra-high" | "pro" | "luna"`.
- `ChatGptWebProviderModelId` — the corresponding `chatgpt-web/<id>` daemon route.
- `ChatGptWebReasoningLevel` — `"low" | "medium" | "high" | "xhigh" | "ultra"`.
- `ChatGptWebModelRoute` — provider-local id, daemon id, name, reasoning level, `requiresPro`,
  `contextWindow`, and `maxTokens`.

## `CHATGPT_WEB_MODEL_ROUTES`

The standard (non-Luna) routes:

| provider id | daemon id | name | reasoning | requiresPro | contextWindow |
|---|---|---|---|---|---|
| `light` | `chatgpt-web/light` | ChatGPT Web — Instant | low | no | 41_000 |
| `medium` | `chatgpt-web/medium` | ChatGPT Web — Medium | medium | no | 90_000 |
| `high` | `chatgpt-web/high` | ChatGPT Web — High | high | no | 90_000 |
| `extra-high` | `chatgpt-web/extra-high` | ChatGPT Web — Extra High | xhigh | yes | 111_193 |
| `pro` | `chatgpt-web/pro` | ChatGPT Web — Pro | ultra | yes | 112_193 |

Pi combines the provider and provider-local model id when displaying a model, so the default high
route is `chatgpt-web/high`, not the redundant `chatgpt-web/chatgpt-web/high`. Before a request is
sent, `chatGptWebProviderModelId` maps the local id to the daemon's canonical route.

## `chatGptWebProviderModelId`

```ts
chatGptWebProviderModelId(model: string): ChatGptWebProviderModelId | undefined
```

Resolves a provider-local id to its daemon route. It also accepts an already canonical daemon id so
request adaptation remains idempotent.

## `isLunaModel`

```ts
isLunaModel(model: string): boolean
```

Returns true for the provider-local `luna` id and canonical `chatgpt-web/luna` daemon route. Used to
block separate compaction, because Luna uses rolling checkpoints.
